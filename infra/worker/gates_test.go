package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"sort"
	"testing"
	"time"
)

func loadWasm(t *testing.T, name string) []byte {
	t.Helper()
	bytes, err := os.ReadFile(filepath.Join("testdata", name))
	if err != nil {
		t.Fatal(err)
	}
	return bytes
}

func TestFuelTimeAndMemoryKillsLeaveNeighborStepping(t *testing.T) {
	echo := loadWasm(t, "step_echo.wasm")
	neighbor, err := newIsolate(context.Background(), "neighbor", echo, testBudget())
	if err != nil {
		t.Fatal(err)
	}
	defer neighbor.close(context.Background())
	before, err := neighbor.tick(context.Background(), 1, json.RawMessage(`[{"n":1}]`))
	if err != nil {
		t.Fatal(err)
	}

	cases := []struct {
		kind   string
		module string
		budget isolateBudget
	}{
		{"fuel", "step_fuel.wasm", isolateBudget{tickTimeout: time.Second, memoryLimitPages: 32, maxSteps: 10, fuelPerTick: 30}},
		{"time", "step_spin.wasm", isolateBudget{tickTimeout: 30 * time.Millisecond, memoryLimitPages: 32, maxSteps: 10, fuelPerTick: 1_000_000}},
		{"memory", "step_memory.wasm", isolateBudget{tickTimeout: time.Second, memoryLimitPages: 16, maxSteps: 10, fuelPerTick: 1_000_000}},
	}
	for _, tc := range cases {
		started := time.Now()
		iso, err := newIsolate(context.Background(), tc.kind, loadWasm(t, tc.module), tc.budget)
		if err != nil {
			t.Fatalf("%s newIsolate: %v", tc.kind, err)
		}
		_, err = iso.tick(context.Background(), 1, json.RawMessage(`[]`))
		iso.close(context.Background())
		if err == nil {
			t.Fatalf("%s tick was not killed", tc.kind)
		}
		if time.Since(started) > 2*time.Second {
			t.Fatalf("%s kill took too long: %s (%v)", tc.kind, time.Since(started), err)
		}
		t.Logf("%s killed in %s: %v", tc.kind, time.Since(started).Round(time.Millisecond), err)
	}

	after, err := neighbor.tick(context.Background(), 2, json.RawMessage(`[{"n":2}]`))
	if err != nil {
		t.Fatalf("neighbor died: %v", err)
	}
	if after.SimulationTick <= before.SimulationTick {
		t.Fatalf("neighbor did not advance: %d -> %d", before.SimulationTick, after.SimulationTick)
	}
}

func TestSnapshotRestoresAfterProcessRestart(t *testing.T) {
	dir := t.TempDir()
	wasm := loadWasm(t, "step_echo.wasm")
	const digest = "abc123abc123abc123abc123abc123abc123abc123abc123abc123abc123abcd"
	first := newManager(newModuleFetcher(""))
	first.stateDir = dir
	first.budget = testBudget()
	iso, err := newIsolate(context.Background(), "m1", wasm, first.budget)
	if err != nil {
		t.Fatal(err)
	}
	iso.moduleSha = digest
	iso.statePath = snapshotPath(dir, "m1")
	first.isolates["m1"] = iso
	if _, err := iso.tick(context.Background(), 4, json.RawMessage(`[{"kept":true}]`)); err != nil {
		t.Fatal(err)
	}
	iso.close(context.Background())
	delete(first.isolates, "m1")

	second := newManager(newModuleFetcher(""))
	second.stateDir = dir
	second.budget = testBudget()
	restored, err := newIsolate(context.Background(), "m1", wasm, second.budget)
	if err != nil {
		t.Fatal(err)
	}
	restored.moduleSha = digest
	restored.statePath = snapshotPath(dir, "m1")
	snap, err := os.ReadFile(restored.statePath)
	if err != nil {
		t.Fatal(err)
	}
	var saved struct {
		ModuleSha256   string          `json:"moduleSha256"`
		SimulationTick int64           `json:"simulationTick"`
		State          json.RawMessage `json:"state"`
	}
	if err := json.Unmarshal(snap, &saved); err != nil {
		t.Fatal(err)
	}
	restored.restore(saved.ModuleSha256, saved.SimulationTick, saved.State)
	if string(restored.lastState) != `[{"kept":true}]` {
		t.Fatalf("restored state = %s", restored.lastState)
	}
	if restored.lastTick != 4 {
		t.Fatalf("restored tick = %d", restored.lastTick)
	}
}

func TestWarmStartP95Under10msWhileNeighborsStep(t *testing.T) {
	wasm := loadWasm(t, "step_echo.wasm")
	neighbors := make([]*isolate, 0, 8)
	for i := 0; i < 8; i++ {
		iso, err := newIsolate(context.Background(), "n", wasm, testBudget())
		if err != nil {
			t.Fatal(err)
		}
		neighbors = append(neighbors, iso)
		defer iso.close(context.Background())
	}
	stop := make(chan struct{})
	done := make(chan struct{})
	go func() {
		defer close(done)
		tick := int64(1)
		for {
			select {
			case <-stop:
				return
			default:
				for _, iso := range neighbors {
					_, _ = iso.tick(context.Background(), tick, json.RawMessage(`[{"n":1}]`))
				}
				tick++
			}
		}
	}()

	samples := make([]float64, 0, 40)
	for i := 0; i < 40; i++ {
		started := time.Now()
		iso, err := newIsolate(context.Background(), "warm", wasm, testBudget())
		elapsed := time.Since(started)
		if err != nil {
			close(stop)
			<-done
			t.Fatal(err)
		}
		iso.close(context.Background())
		samples = append(samples, float64(elapsed.Microseconds())/1000)
	}
	close(stop)
	<-done
	sort.Float64s(samples)
	p95 := samples[len(samples)*95/100]
	t.Logf("warm-start p95 %.3f ms (n=%d, neighbors=%d)", p95, len(samples), len(neighbors))
	if p95 >= 10 {
		t.Fatalf("warm-start p95 %.3f ms is not under 10ms", p95)
	}
}

func TestReplaySameInputsSameState(t *testing.T) {
	wasm := loadWasm(t, "step_echo.wasm")
	inputs := []json.RawMessage{
		json.RawMessage(`[{"seq":1}]`),
		json.RawMessage(`[{"seq":2}]`),
		json.RawMessage(`[{"seq":3}]`),
	}
	run := func() string {
		t.Helper()
		iso, err := newIsolate(context.Background(), "replay", wasm, testBudget())
		if err != nil {
			t.Fatal(err)
		}
		defer iso.close(context.Background())
		var last tickResult
		for i, input := range inputs {
			last, err = iso.tick(context.Background(), int64(i+1), input)
			if err != nil {
				t.Fatal(err)
			}
		}
		sum := sha256.Sum256(last.State)
		return hex.EncodeToString(sum[:])
	}
	first, second := run(), run()
	if first != second {
		t.Fatalf("replay diverged %s vs %s", first, second)
	}
}

// TestWriteServerAuthorityEvidence re-runs the measurements and writes the
// gate JSON the verifier hashes. It does not invent an outside sandbox
// review. Set LOKI_GATE_EVIDENCE_DIR to opt in.
func TestWriteServerAuthorityEvidence(t *testing.T) {
	dir := os.Getenv("LOKI_GATE_EVIDENCE_DIR")
	if dir == "" {
		t.Skip("set LOKI_GATE_EVIDENCE_DIR to write evidence")
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	env := "local-darwin-arm64"

	wasm := loadWasm(t, "step_echo.wasm")
	neighbors := 8
	samples := make([]float64, 0, 40)
	live := make([]*isolate, 0, neighbors)
	for i := 0; i < neighbors; i++ {
		iso, err := newIsolate(context.Background(), "n", wasm, testBudget())
		if err != nil {
			t.Fatal(err)
		}
		live = append(live, iso)
		defer iso.close(context.Background())
	}
	stop := make(chan struct{})
	done := make(chan struct{})
	go func() {
		defer close(done)
		var tick int64 = 1
		for {
			select {
			case <-stop:
				return
			default:
				for _, iso := range live {
					_, _ = iso.tick(context.Background(), tick, json.RawMessage(`[{"n":1}]`))
				}
				tick++
			}
		}
	}()
	for i := 0; i < 40; i++ {
		started := time.Now()
		iso, err := newIsolate(context.Background(), "warm", wasm, testBudget())
		elapsed := float64(time.Since(started).Microseconds()) / 1000
		if err != nil {
			close(stop)
			<-done
			t.Fatal(err)
		}
		iso.close(context.Background())
		samples = append(samples, elapsed)
	}
	close(stop)
	<-done
	sort.Float64s(samples)
	p95 := samples[len(samples)*95/100]
	writeEvidence(t, dir, "warm-start.json", map[string]any{
		"schemaVersion": 1, "generatedAt": now, "environment": env,
		"concurrentMatches": neighbors, "samples": len(samples), "warmStartMsP95": p95,
		"sourceReferences": []string{"infra/worker/gates_test.go"},
	})

	neighbor, err := newIsolate(context.Background(), "neighbor", wasm, testBudget())
	if err != nil {
		t.Fatal(err)
	}
	defer neighbor.close(context.Background())
	if _, err := neighbor.tick(context.Background(), 1, json.RawMessage(`[{"n":1}]`)); err != nil {
		t.Fatal(err)
	}
	faults := []struct {
		kind, module string
		budget       isolateBudget
	}{
		{"fuel", "step_fuel.wasm", isolateBudget{tickTimeout: time.Second, memoryLimitPages: 32, maxSteps: 10, fuelPerTick: 30}},
		{"time", "step_spin.wasm", isolateBudget{tickTimeout: 30 * time.Millisecond, memoryLimitPages: 32, maxSteps: 10, fuelPerTick: 1_000_000}},
		{"memory", "step_memory.wasm", isolateBudget{tickTimeout: time.Second, memoryLimitPages: 16, maxSteps: 10, fuelPerTick: 1_000_000}},
	}
	injections := make([]map[string]any, 0, len(faults))
	ticks := int64(1)
	for _, fault := range faults {
		started := time.Now()
		iso, err := newIsolate(context.Background(), fault.kind, loadWasm(t, fault.module), fault.budget)
		if err != nil {
			t.Fatal(err)
		}
		_, err = iso.tick(context.Background(), 1, json.RawMessage(`[]`))
		iso.close(context.Background())
		if err == nil {
			t.Fatalf("%s was not killed", fault.kind)
		}
		before := ticks
		if _, err := neighbor.tick(context.Background(), ticks+1, json.RawMessage(`[{"n":1}]`)); err != nil {
			t.Fatal(err)
		}
		ticks++
		injections = append(injections, map[string]any{
			"kind": fault.kind, "killed": true,
			"killedWithinMs":      float64(time.Since(started).Microseconds()) / 1000,
			"neighborMatchId":     neighbor.matchID,
			"neighborTicksBefore": before,
			"neighborTicksAfter":  ticks,
		})
	}
	writeEvidence(t, dir, "metering.json", map[string]any{
		"schemaVersion": 1, "generatedAt": now, "environment": env,
		"faultInjections": injections, "sourceReferences": []string{"infra/worker/gates_test.go"},
	})

	stateDir := t.TempDir()
	const digest = "abc123abc123abc123abc123abc123abc123abc123abc123abc123abc123abcd"
	iso, err := newIsolate(context.Background(), "m1", wasm, testBudget())
	if err != nil {
		t.Fatal(err)
	}
	iso.moduleSha = digest
	iso.statePath = snapshotPath(stateDir, "m1")
	if _, err := iso.tick(context.Background(), 4, json.RawMessage(`[{"kept":true}]`)); err != nil {
		t.Fatal(err)
	}
	iso.close(context.Background())
	restored, err := newIsolate(context.Background(), "m1", wasm, testBudget())
	if err != nil {
		t.Fatal(err)
	}
	defer restored.close(context.Background())
	snap, err := os.ReadFile(snapshotPath(stateDir, "m1"))
	if err != nil {
		t.Fatal(err)
	}
	var saved struct {
		ModuleSha256   string          `json:"moduleSha256"`
		SimulationTick int64           `json:"simulationTick"`
		State          json.RawMessage `json:"state"`
	}
	if err := json.Unmarshal(snap, &saved); err != nil {
		t.Fatal(err)
	}
	restored.restore(saved.ModuleSha256, saved.SimulationTick, saved.State)
	if string(restored.lastState) != `[{"kept":true}]` || restored.lastTick != 4 {
		t.Fatalf("restore failed: tick=%d state=%s", restored.lastTick, restored.lastState)
	}
	writeEvidence(t, dir, "crash-recovery.json", map[string]any{
		"schemaVersion": 1, "generatedAt": now, "environment": env,
		"workerKilledMidMatch": true, "outcome": "restored-last-snapshot",
		"fellBackToPlayerHost": false,
		"sourceReferences":     []string{"infra/worker/gates_test.go", "test/loki-server-authority.test.ts"},
	})

	inputs := []json.RawMessage{json.RawMessage(`[{"seq":1}]`), json.RawMessage(`[{"seq":2}]`)}
	inputSum := sha256.Sum256([]byte(`[{"seq":1}][{"seq":2}]`))
	var finals []string
	for runID := 1; runID <= 2; runID++ {
		replay, err := newIsolate(context.Background(), "replay", wasm, testBudget())
		if err != nil {
			t.Fatal(err)
		}
		var last tickResult
		for i, input := range inputs {
			last, err = replay.tick(context.Background(), int64(i+1), input)
			if err != nil {
				t.Fatal(err)
			}
		}
		replay.close(context.Background())
		sum := sha256.Sum256(last.State)
		finals = append(finals, hex.EncodeToString(sum[:]))
	}
	writeEvidence(t, dir, "replay-determinism.json", map[string]any{
		"schemaVersion": 1, "generatedAt": now, "environment": env,
		"inputLogSha256": hex.EncodeToString(inputSum[:]),
		"runs": []map[string]any{
			{"runId": "1", "finalStateSha256": finals[0], "ticksExecuted": 2},
			{"runId": "2", "finalStateSha256": finals[1], "ticksExecuted": 2},
		},
		"sourceReferences": []string{"infra/worker/gates_test.go"},
	})
	if p95 >= 10 {
		t.Fatalf("refusing to record a warm-start p95 of %.3fms", p95)
	}
}

func writeEvidence(t *testing.T, dir, name string, value map[string]any) {
	t.Helper()
	bytes, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	bytes = append(bytes, '\n')
	if err := os.WriteFile(filepath.Join(dir, name), bytes, 0o644); err != nil {
		t.Fatal(err)
	}
}
