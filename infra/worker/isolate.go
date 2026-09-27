package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sync"
	"time"

	"os"
	"path/filepath"

	"github.com/tetratelabs/wazero"
	"github.com/tetratelabs/wazero/api"
	"github.com/tetratelabs/wazero/experimental"
)

// --- The step ABI (v1) ------------------------------------------------------
// Loki writes the previous state and this tick's inputs into a linear
// memory region and reads the next state back (see the plan's
// server-authority contract). Concretely, for a module with no imports:
//
//	step(inputLen uint32, stateLen uint32) uint32
//
// The worker writes `inputLen` bytes of canonical JSON at offset
// inputRegionOffset, and `stateLen` bytes of the previous state's canonical
// JSON at offset stateRegionOffset, before calling step. The module reads
// both, computes the next state, and writes its own canonical JSON back
// into the state region (up to stateRegionSize bytes), returning the
// number of bytes it wrote. A module that imports anything, or does not
// export exactly this, never reaches instantiation (see validate.go).
const (
	inputRegionOffset = 0
	inputRegionSize   = 512 * 1024
	stateRegionOffset = inputRegionSize
	stateRegionSize   = 512 * 1024
)

// Budgets applied per isolate. Each live match has its own wazero.Runtime,
// so a kill never disturbs a neighbor. fuelPerTick is a call-count budget
// (wazero has no per-instruction counter): every guest function call,
// including recursive ones, decrements it, and exhausting it cancels the
// tick. tickTimeout kills a single-function spin loop. memoryLimitPages
// rejects a grow past the cap. maxSteps is a lifetime backstop on top.
type isolateBudget struct {
	tickTimeout      time.Duration
	memoryLimitPages uint32
	maxSteps         int64
	fuelPerTick      int64
}

func defaultIsolateBudget() isolateBudget {
	return isolateBudget{
		tickTimeout:      envDuration("LOKI_WORKER_TICK_TIMEOUT_MS", 20*time.Millisecond, time.Millisecond),
		memoryLimitPages: envUint32("LOKI_WORKER_MEMORY_LIMIT_PAGES", 48),
		maxSteps:         envInt64("LOKI_WORKER_MAX_STEPS", 10_000_000),
		fuelPerTick:      envInt64("LOKI_WORKER_FUEL_PER_TICK", 1_000_000),
	}
}

// isolate is one fuel-metered WebAssembly instance for exactly one live
// match. It owns its own wazero.Runtime (never shared with another match)
// so WithCloseOnContextDone/WithMemoryLimitPages isolation is real, not
// just per-call.
type isolate struct {
	matchID string
	budget  isolateBudget

	mu            sync.Mutex
	runtime       wazero.Runtime
	module        api.Module
	stepFn        api.Function
	lastState     []byte // canonical JSON; nil until the first successful tick
	lastTick      int64
	stepsExecuted int64
	callsLeft     int64
	cancelTick    context.CancelFunc
	statePath     string
	moduleSha     string
	createdAt     time.Time
	lastUsedAt    time.Time
	faulted       bool
}

// NewFunctionListener implements experimental.FunctionListenerFactory.
func (iso *isolate) NewFunctionListener(def api.FunctionDefinition) experimental.FunctionListener {
	if def.GoFunction() != nil {
		return nil
	}
	return iso
}

func (iso *isolate) Before(context.Context, api.Module, api.FunctionDefinition, []uint64, experimental.StackIterator) {
	iso.callsLeft--
	if iso.callsLeft < 0 && iso.cancelTick != nil {
		iso.cancelTick()
	}
}

func (iso *isolate) After(context.Context, api.Module, api.FunctionDefinition, []uint64) {}

func (iso *isolate) Abort(context.Context, api.Module, api.FunctionDefinition, error) {}

func newIsolate(ctx context.Context, matchID string, wasmBytes []byte, budget isolateBudget) (*isolate, error) {
	if err := validateStepModule(wasmBytes); err != nil {
		return nil, fmt.Errorf("step module rejected: %w", err)
	}
	iso := &isolate{
		matchID: matchID,
		budget:  budget,
	}
	ctx = experimental.WithFunctionListenerFactory(ctx, iso)
	config := wazero.NewRuntimeConfig().
		WithCloseOnContextDone(true).
		WithMemoryLimitPages(budget.memoryLimitPages)
	runtime := wazero.NewRuntimeWithConfig(ctx, config)

	compiled, err := runtime.CompileModule(ctx, wasmBytes)
	if err != nil {
		runtime.Close(ctx)
		return nil, fmt.Errorf("compile step module: %w", err)
	}
	module, err := runtime.InstantiateModule(ctx, compiled, wazero.NewModuleConfig().WithName(matchID))
	if err != nil {
		runtime.Close(ctx)
		return nil, fmt.Errorf("instantiate step module: %w", err)
	}
	stepFn := module.ExportedFunction("step")
	if stepFn == nil {
		runtime.Close(ctx)
		return nil, errors.New("step module does not export step")
	}
	mem := module.Memory()
	if mem == nil || mem.Size() < uint32(stateRegionOffset+stateRegionSize) {
		runtime.Close(ctx)
		return nil, errors.New("step module does not define enough memory for the ABI regions")
	}
	now := time.Now()
	iso.runtime = runtime
	iso.module = module
	iso.stepFn = stepFn
	iso.createdAt = now
	iso.lastUsedAt = now
	return iso, nil
}

// tickResult is what a successful tick reports back to Nakama.
type tickResult struct {
	SimulationTick int64           `json:"simulationTick"`
	State          json.RawMessage `json:"state"`
}

// tick runs exactly one step() call for this isolate. On any failure (over
// budget, trap, or a step that did not produce valid JSON) the isolate's
// last known-good state is left untouched — the caller (the HTTP handler)
// reports the failure to Nakama, which either lets the room keep polling
// (this isolate can still serve the same last-good state, satisfying "a
// dead worker restores the last snapshot") or ends the room after enough
// consecutive failures. A faulted isolate is never silently recreated with
// fresh state; teardown+recreate is an explicit, separate operation.
func (iso *isolate) tick(parentCtx context.Context, requestedTick int64, inputs json.RawMessage) (tickResult, error) {
	iso.mu.Lock()
	defer iso.mu.Unlock()

	if iso.faulted {
		return tickResult{}, errors.New("isolate previously faulted; awaiting teardown")
	}
	if iso.stepsExecuted >= iso.budget.maxSteps {
		iso.faulted = true
		return tickResult{}, errors.New("isolate exceeded its lifetime step budget")
	}

	previousState := iso.lastState
	if previousState == nil {
		previousState = []byte("null")
	}
	if len(inputs) > inputRegionSize {
		return tickResult{}, errors.New("tick inputs exceed the input region size")
	}
	if len(previousState) > stateRegionSize {
		iso.faulted = true
		return tickResult{}, errors.New("previous state exceeds the state region size")
	}

	mem := iso.module.Memory()
	if !mem.Write(inputRegionOffset, inputs) {
		return tickResult{}, errors.New("failed to write inputs into isolate memory")
	}
	if !mem.Write(stateRegionOffset, previousState) {
		return tickResult{}, errors.New("failed to write previous state into isolate memory")
	}

	ctx, cancel := context.WithTimeout(parentCtx, iso.budget.tickTimeout)
	defer cancel()
	iso.callsLeft = iso.budget.fuelPerTick
	iso.cancelTick = cancel
	defer func() { iso.cancelTick = nil }()
	results, err := iso.stepFn.Call(ctx, uint64(len(inputs)), uint64(len(previousState)))
	iso.stepsExecuted++
	if err != nil {
		// A timeout, a trap (e.g. out-of-bounds access, integer divide by
		// zero), or a memory-limit allocation failure all surface here.
		// This isolate stays usable; it just did not advance this tick.
		return tickResult{}, fmt.Errorf("step call failed: %w", err)
	}
	if len(results) != 1 {
		iso.faulted = true
		return tickResult{}, errors.New("step did not return exactly one value")
	}
	newStateLen := uint32(results[0])
	if newStateLen > stateRegionSize {
		iso.faulted = true
		return tickResult{}, errors.New("step reported a state length larger than the state region")
	}
	newState, ok := mem.Read(stateRegionOffset, newStateLen)
	if !ok {
		iso.faulted = true
		return tickResult{}, errors.New("failed to read next state from isolate memory")
	}
	if !json.Valid(newState) {
		iso.faulted = true
		return tickResult{}, errors.New("step wrote a next state that is not valid JSON")
	}
	// Copy out of wasm linear memory before returning; the next tick's
	// Write into the same region would otherwise corrupt this slice.
	stateCopy := make([]byte, len(newState))
	copy(stateCopy, newState)

	iso.lastState = stateCopy
	iso.lastTick = requestedTick
	iso.lastUsedAt = time.Now()
	if err := iso.persistLocked(); err != nil {
		return tickResult{}, err
	}
	return tickResult{SimulationTick: requestedTick, State: json.RawMessage(stateCopy)}, nil
}

func (iso *isolate) restore(moduleSha string, tick int64, state []byte) {
	iso.mu.Lock()
	defer iso.mu.Unlock()
	iso.moduleSha = moduleSha
	iso.lastTick = tick
	iso.lastState = append([]byte(nil), state...)
}

func (iso *isolate) persistLocked() error {
	if iso.statePath == "" || iso.lastState == nil {
		return nil
	}
	payload, err := json.Marshal(struct {
		ModuleSha256   string          `json:"moduleSha256"`
		SimulationTick int64           `json:"simulationTick"`
		State          json.RawMessage `json:"state"`
	}{iso.moduleSha, iso.lastTick, json.RawMessage(iso.lastState)})
	if err != nil {
		return err
	}
	tmp := iso.statePath + ".tmp"
	if err := os.WriteFile(tmp, payload, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, iso.statePath)
}

func snapshotPath(dir, matchID string) string {
	return filepath.Join(dir, matchID+".json")
}

func (iso *isolate) close(ctx context.Context) {
	iso.mu.Lock()
	defer iso.mu.Unlock()
	_ = iso.runtime.Close(ctx)
}

func (iso *isolate) idleFor() time.Duration {
	iso.mu.Lock()
	defer iso.mu.Unlock()
	return time.Since(iso.lastUsedAt)
}
