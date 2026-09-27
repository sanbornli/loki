package main

import (
	"context"
	"encoding/json"
	"os"
	"testing"
	"time"
)

// testdata/step_echo.wasm is a hand-built module (see testdata/step_echo.wat
// for the source) with no imports, 16 pages of memory, and a single
// exported function "step(inputLen, stateLen) -> newStateLen" that copies
// the input region into the state region and reports its length back —
// enough to exercise the real ABI wiring (ExportedFunction, Memory.Write/
// Read, and the ABI offsets) against an actual wazero-compiled module
// rather than only the pure-Go structural validator.
func loadEchoModule(t *testing.T) []byte {
	t.Helper()
	bytes, err := os.ReadFile("testdata/step_echo.wasm")
	if err != nil {
		t.Fatalf("failed to read test wasm module: %v", err)
	}
	return bytes
}

func testBudget() isolateBudget {
	return isolateBudget{
		tickTimeout:      2 * time.Second,
		memoryLimitPages: 16,
		maxSteps:         1000,
		fuelPerTick:      100_000,
	}
}

func TestIsolateTickEchoesInputIntoState(t *testing.T) {
	ctx := context.Background()
	iso, err := newIsolate(ctx, "match-1", loadEchoModule(t), testBudget())
	if err != nil {
		t.Fatalf("newIsolate failed: %v", err)
	}
	defer iso.close(ctx)

	result, err := iso.tick(ctx, 1, json.RawMessage(`{"a":1}`))
	if err != nil {
		t.Fatalf("tick failed: %v", err)
	}
	if result.SimulationTick != 1 {
		t.Fatalf("expected simulationTick 1, got %d", result.SimulationTick)
	}
	if string(result.State) != `{"a":1}` {
		t.Fatalf("expected state to echo the input, got %q", string(result.State))
	}

	// The second tick's "previous state" is the first tick's output; the
	// echo module ignores stateLen entirely, so this just proves the
	// isolate carries lastState across calls without reinitializing it.
	result2, err := iso.tick(ctx, 2, json.RawMessage(`{"b":2}`))
	if err != nil {
		t.Fatalf("second tick failed: %v", err)
	}
	if string(result2.State) != `{"b":2}` {
		t.Fatalf("expected second tick to echo its own input, got %q", string(result2.State))
	}
}

func TestIsolateRejectsInvalidNextStateJSON(t *testing.T) {
	ctx := context.Background()
	iso, err := newIsolate(ctx, "match-2", loadEchoModule(t), testBudget())
	if err != nil {
		t.Fatalf("newIsolate failed: %v", err)
	}
	defer iso.close(ctx)

	if _, err := iso.tick(ctx, 1, json.RawMessage(`not json`)); err == nil {
		t.Fatal("expected a non-JSON echoed state to be rejected")
	}
}

func TestNewIsolateRejectsModuleWithImports(t *testing.T) {
	ctx := context.Background()
	wasm := buildWasm(t, 1, []string{"step"})
	if _, err := newIsolate(ctx, "match-3", wasm, testBudget()); err == nil {
		t.Fatal("expected a module with imports to be rejected before instantiation")
	}
}

func TestIsolateLifetimeStepBudget(t *testing.T) {
	ctx := context.Background()
	budget := testBudget()
	budget.maxSteps = 2
	iso, err := newIsolate(ctx, "match-4", loadEchoModule(t), budget)
	if err != nil {
		t.Fatalf("newIsolate failed: %v", err)
	}
	defer iso.close(ctx)

	if _, err := iso.tick(ctx, 1, json.RawMessage(`{}`)); err != nil {
		t.Fatalf("first tick within budget failed: %v", err)
	}
	if _, err := iso.tick(ctx, 2, json.RawMessage(`{}`)); err != nil {
		t.Fatalf("second tick within budget failed: %v", err)
	}
	if _, err := iso.tick(ctx, 3, json.RawMessage(`{}`)); err == nil {
		t.Fatal("expected the isolate to fault once its lifetime step budget is exhausted")
	}
	if _, err := iso.tick(ctx, 4, json.RawMessage(`{}`)); err == nil {
		t.Fatal("expected a faulted isolate to keep rejecting further ticks")
	}
}
