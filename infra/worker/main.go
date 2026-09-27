// Loki's simulation worker: one Go process, running in the same Singapore
// region as Nakama, that steps one fuel-metered WebAssembly isolate per
// live "server"-authority match and tears it down when the room ends (see
// the plan's "Simulation fleet" section). For this prototype the worker is
// also its own orchestrator: it records its own placements and answers
// Nakama's per-tick/teardown calls directly. A pool spanning many worker
// processes is future work once matches actually need to spread across
// more than one machine.
package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"
)

func envString(name, fallback string) string {
	if value := os.Getenv(name); value != "" {
		return value
	}
	return fallback
}

func envDuration(name string, fallback time.Duration, unit time.Duration) time.Duration {
	raw := os.Getenv(name)
	if raw == "" {
		return fallback
	}
	parsed, err := strconv.ParseInt(raw, 10, 64)
	if err != nil || parsed <= 0 {
		return fallback
	}
	return time.Duration(parsed) * unit
}

func envUint32(name string, fallback uint32) uint32 {
	raw := os.Getenv(name)
	if raw == "" {
		return fallback
	}
	parsed, err := strconv.ParseUint(raw, 10, 32)
	if err != nil || parsed == 0 {
		return fallback
	}
	return uint32(parsed)
}

func envInt64(name string, fallback int64) int64 {
	raw := os.Getenv(name)
	if raw == "" {
		return fallback
	}
	parsed, err := strconv.ParseInt(raw, 10, 64)
	if err != nil || parsed <= 0 {
		return fallback
	}
	return parsed
}

// stepModuleDescriptor mirrors packages/protocol StepModuleDescriptorSchema.
type stepModuleDescriptor struct {
	AbiVersion int    `json:"abiVersion"`
	ModulePath string `json:"modulePath"`
	Sha256     string `json:"sha256"`
}

const maxStepModuleBytes = 5 * 1024 * 1024

// moduleFetcher resolves a stepModuleDescriptor to validated wasm bytes,
// fetching from LOKI_WORKER_MODULE_BASE_URL + "/" + sha256 and verifying
// the digest before ever handing the bytes to newIsolate. Modules are
// cached by hash for the process lifetime: a room always stays on the
// exact build that passed the upload boundary (apps/api/src/step-module.ts),
// and a second match reusing the same module never re-fetches it.
type moduleFetcher struct {
	baseURL string
	client  *http.Client

	mu    sync.Mutex
	cache map[string][]byte
}

func newModuleFetcher(baseURL string) *moduleFetcher {
	return &moduleFetcher{
		baseURL: baseURL,
		client:  &http.Client{Timeout: 10 * time.Second},
		cache:   make(map[string][]byte),
	}
}

func (f *moduleFetcher) fetch(ctx context.Context, descriptor stepModuleDescriptor) ([]byte, error) {
	if descriptor.AbiVersion != 1 {
		return nil, fmt.Errorf("unsupported step module abiVersion %d", descriptor.AbiVersion)
	}
	digest := descriptor.Sha256
	f.mu.Lock()
	if cached, ok := f.cache[digest]; ok {
		f.mu.Unlock()
		return cached, nil
	}
	f.mu.Unlock()

	if f.baseURL == "" {
		return nil, errors.New("no module base URL is configured")
	}
	url := fmt.Sprintf("%s/%s", f.baseURL, digest)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	resp, err := f.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("fetch step module: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("fetch step module: unexpected status %d", resp.StatusCode)
	}
	limited := io.LimitReader(resp.Body, maxStepModuleBytes+1)
	bytes, err := io.ReadAll(limited)
	if err != nil {
		return nil, fmt.Errorf("read step module: %w", err)
	}
	if len(bytes) > maxStepModuleBytes {
		return nil, errors.New("step module exceeds the prototype size limit")
	}
	sum := sha256.Sum256(bytes)
	if hex.EncodeToString(sum[:]) != digest {
		return nil, errors.New("step module sha256 does not match its descriptor")
	}

	f.mu.Lock()
	f.cache[digest] = bytes
	f.mu.Unlock()
	return bytes, nil
}

// manager owns every live match's isolate. One isolate per match, created
// on /matches and destroyed on /matches/{id}/teardown or by the idle
// reaper below.
type manager struct {
	budget   isolateBudget
	fetcher  *moduleFetcher
	stateDir string

	mu       sync.Mutex
	isolates map[string]*isolate
}

func newManager(fetcher *moduleFetcher) *manager {
	return &manager{
		budget:   defaultIsolateBudget(),
		fetcher:  fetcher,
		isolates: make(map[string]*isolate),
	}
}

func (m *manager) place(ctx context.Context, matchID string, descriptor stepModuleDescriptor) error {
	m.mu.Lock()
	if _, exists := m.isolates[matchID]; exists {
		m.mu.Unlock()
		return nil // idempotent: a retried placement for the same match is a no-op.
	}
	m.mu.Unlock()

	wasmBytes, err := m.fetcher.fetch(ctx, descriptor)
	if err != nil {
		return err
	}
	iso, err := newIsolate(ctx, matchID, wasmBytes, m.budget)
	if err != nil {
		return err
	}
	iso.moduleSha = descriptor.Sha256
	if m.stateDir != "" {
		iso.statePath = snapshotPath(m.stateDir, matchID)
		if snap, err := os.ReadFile(iso.statePath); err == nil {
			var saved struct {
				ModuleSha256   string          `json:"moduleSha256"`
				SimulationTick int64           `json:"simulationTick"`
				State          json.RawMessage `json:"state"`
			}
			if json.Unmarshal(snap, &saved) == nil && saved.ModuleSha256 == descriptor.Sha256 && json.Valid(saved.State) {
				iso.restore(saved.ModuleSha256, saved.SimulationTick, saved.State)
			}
		}
	}
	m.mu.Lock()
	if _, exists := m.isolates[matchID]; exists {
		m.mu.Unlock()
		iso.close(ctx)
		return nil
	}
	m.isolates[matchID] = iso
	m.mu.Unlock()
	return nil
}

func (m *manager) get(matchID string) (*isolate, bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	iso, ok := m.isolates[matchID]
	return iso, ok
}

func (m *manager) teardown(ctx context.Context, matchID string) {
	m.mu.Lock()
	iso, ok := m.isolates[matchID]
	if ok {
		delete(m.isolates, matchID)
	}
	m.mu.Unlock()
	if ok {
		iso.close(ctx)
		if iso.statePath != "" {
			_ = os.Remove(iso.statePath)
		}
	}
}

func (m *manager) matchCount() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return len(m.isolates)
}

// reapIdle closes and forgets any isolate unused for longer than maxIdle.
// This is the backstop for a room that ended without ever calling
// /teardown (e.g. Nakama itself crashed); it never substitutes for the
// explicit teardown call, which is the fast path.
func (m *manager) reapIdle(ctx context.Context, maxIdle time.Duration) {
	m.mu.Lock()
	stale := make([]*isolate, 0)
	for id, iso := range m.isolates {
		if iso.idleFor() > maxIdle {
			stale = append(stale, iso)
			delete(m.isolates, id)
		}
	}
	m.mu.Unlock()
	for _, iso := range stale {
		log.Printf("reaping idle isolate for match %s", iso.matchID)
		iso.close(ctx)
	}
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("content-type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}

type server struct {
	manager   *manager
	publicURL string
}

// POST /matches {matchId, tickRate, stepModule}
func (s *server) handlePlace(w http.ResponseWriter, r *http.Request) {
	var body struct {
		MatchID    string               `json:"matchId"`
		TickRate   int                  `json:"tickRate"`
		StepModule stepModuleDescriptor `json:"stepModule"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if body.MatchID == "" {
		writeError(w, http.StatusBadRequest, "matchId is required")
		return
	}
	if err := s.manager.place(r.Context(), body.MatchID, body.StepModule); err != nil {
		log.Printf("place %s failed: %v", body.MatchID, err)
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"workerUrl": s.publicURL})
}

// POST /matches/{id}/tick {tick, inputs}
func (s *server) handleTick(w http.ResponseWriter, r *http.Request, matchID string) {
	iso, ok := s.manager.get(matchID)
	if !ok {
		writeError(w, http.StatusNotFound, "no isolate for this match; place it first")
		return
	}
	var body struct {
		Tick   int64           `json:"tick"`
		Inputs json.RawMessage `json:"inputs"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if body.Inputs == nil {
		body.Inputs = json.RawMessage("[]")
	}
	result, err := iso.tick(r.Context(), body.Tick, body.Inputs)
	if err != nil {
		log.Printf("tick %s failed: %v", matchID, err)
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, result)
}

// POST /matches/{id}/teardown
func (s *server) handleTeardown(w http.ResponseWriter, r *http.Request, matchID string) {
	s.manager.teardown(r.Context(), matchID)
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *server) handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":      true,
		"matches": s.manager.matchCount(),
	})
}

func main() {
	if len(os.Args) > 1 && os.Args[1] == "kill-demo" {
		os.Exit(runKillDemo(os.Args[2:]))
	}
	publicURL := envString("LOKI_WORKER_PUBLIC_URL", "")
	if publicURL == "" {
		log.Fatal("LOKI_WORKER_PUBLIC_URL is required (the URL Nakama uses to reach this worker)")
	}
	// Railway interpolates RAILWAY_PRIVATE_DOMAIN but not the runtime PORT,
	// so a URL that ends in ":" gets the port this process actually bound.
	if strings.HasSuffix(publicURL, ":") {
		if port := os.Getenv("PORT"); port != "" {
			publicURL += port
		}
	}
	moduleBaseURL := envString("LOKI_WORKER_MODULE_BASE_URL", "")
	listenAddr := envString("LOKI_WORKER_LISTEN_ADDR", "")
	if listenAddr == "" {
		if port := os.Getenv("PORT"); port != "" {
			listenAddr = ":" + port
		} else {
			listenAddr = ":8090"
		}
	}
	idleTimeout := envDuration("LOKI_WORKER_IDLE_TIMEOUT_SECONDS", 10*time.Minute, time.Second)
	stateDir := envString("LOKI_WORKER_STATE_DIR", "")
	if stateDir != "" {
		if err := os.MkdirAll(stateDir, 0o700); err != nil {
			log.Fatalf("create state dir: %v", err)
		}
	}

	fetcher := newModuleFetcher(moduleBaseURL)
	mgr := newManager(fetcher)
	mgr.stateDir = stateDir
	srv := &server{manager: mgr, publicURL: publicURL}

	go func() {
		ticker := time.NewTicker(30 * time.Second)
		defer ticker.Stop()
		for range ticker.C {
			mgr.reapIdle(context.Background(), idleTimeout)
		}
	}()

	mux := http.NewServeMux()
	mux.HandleFunc("/health", srv.handleHealth)
	mux.HandleFunc("/matches", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			writeError(w, http.StatusMethodNotAllowed, "POST only")
			return
		}
		srv.handlePlace(w, r)
	})
	mux.HandleFunc("/matches/", func(w http.ResponseWriter, r *http.Request) {
		// Path shape: /matches/{id}/tick or /matches/{id}/teardown.
		path := r.URL.Path[len("/matches/"):]
		matchID, action, ok := splitMatchAction(path)
		if !ok {
			writeError(w, http.StatusNotFound, "not found")
			return
		}
		if r.Method != http.MethodPost {
			writeError(w, http.StatusMethodNotAllowed, "POST only")
			return
		}
		switch action {
		case "tick":
			srv.handleTick(w, r, matchID)
		case "teardown":
			srv.handleTeardown(w, r, matchID)
		default:
			writeError(w, http.StatusNotFound, "not found")
		}
	})

	log.Printf("loki worker listening on %s (public URL %s)", listenAddr, publicURL)
	log.Fatal(http.ListenAndServe(listenAddr, mux))
}

// runKillDemo is the creator-facing local runner from plan section 6: the
// same ABI and the same fuel/time/memory budgets as the fleet, executed on
// the machine in front of the creator so a kill is visible without a deploy.
// Run from infra/worker: `go run . kill-demo fuel`.
func runKillDemo(args []string) int {
	kind := "fuel"
	if len(args) > 0 && args[0] != "" {
		kind = args[0]
	}
	modules := map[string]string{
		"fuel":   "testdata/step_fuel.wasm",
		"time":   "testdata/step_spin.wasm",
		"memory": "testdata/step_memory.wasm",
	}
	path, ok := modules[kind]
	if !ok {
		fmt.Fprintf(os.Stderr, "usage: worker kill-demo [fuel|time|memory]\n")
		return 2
	}
	wasmBytes, err := os.ReadFile(path)
	if err != nil {
		fmt.Fprintf(os.Stderr, "read module: %v\n", err)
		return 1
	}
	budget := isolateBudget{tickTimeout: time.Second, memoryLimitPages: 48, maxSteps: 10, fuelPerTick: 1_000_000}
	switch kind {
	case "fuel":
		budget.fuelPerTick = 30
	case "time":
		budget.tickTimeout = 30 * time.Millisecond
	case "memory":
		budget.memoryLimitPages = 16
	}
	started := time.Now()
	iso, err := newIsolate(context.Background(), "local-demo", wasmBytes, budget)
	if err != nil {
		fmt.Fprintf(os.Stderr, "isolate rejected the module before scheduling: %v\n", err)
		return 1
	}
	defer iso.close(context.Background())
	_, err = iso.tick(context.Background(), 1, json.RawMessage("[]"))
	if err == nil {
		fmt.Fprintf(os.Stderr, "%s was not killed\n", kind)
		return 1
	}
	fmt.Printf("killed kind=%s withinMs=%d error=%v\n", kind, time.Since(started).Milliseconds(), err)
	return 0
}

// splitMatchAction splits "{id}/{action}" (id may itself be opaque, but
// never contains a slash) into its two parts.
func splitMatchAction(path string) (matchID string, action string, ok bool) {
	for i := len(path) - 1; i >= 0; i-- {
		if path[i] == '/' {
			return path[:i], path[i+1:], path[:i] != "" && path[i+1:] != ""
		}
	}
	return "", "", false
}
