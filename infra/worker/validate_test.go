package main

import (
	"strings"
	"testing"
)

// buildWasm assembles a minimal valid WebAssembly binary with the given
// number of dummy imports and function export names, mirroring the
// TypeScript test helper in test/step-module.test.ts so both validators are
// exercised against the same shapes.
func buildWasm(t *testing.T, importCount int, exportNames []string) []byte {
	t.Helper()
	var out []byte
	out = append(out, wasmMagic...)
	out = append(out, wasmVersion...)

	if importCount > 0 {
		var body []byte
		body = append(body, uleb(uint32(importCount))...)
		for i := 0; i < importCount; i++ {
			body = append(body, encodeName("m")...)
			body = append(body, encodeName("f")...)
			body = append(body, 0x02) // memory import kind
			body = append(body, 0x00) // limits: no max
			body = append(body, uleb(1)...)
		}
		out = append(out, encodeSection(sectionImport, body)...)
	}

	var exportBody []byte
	exportBody = append(exportBody, uleb(uint32(len(exportNames)))...)
	for _, name := range exportNames {
		exportBody = append(exportBody, encodeName(name)...)
		exportBody = append(exportBody, byte(exportKindFunction))
		exportBody = append(exportBody, uleb(0)...)
	}
	out = append(out, encodeSection(sectionExport, exportBody)...)
	return out
}

func uleb(value uint32) []byte {
	var out []byte
	for {
		b := byte(value & 0x7f)
		value >>= 7
		if value != 0 {
			out = append(out, b|0x80)
		} else {
			out = append(out, b)
			break
		}
	}
	return out
}

func encodeName(name string) []byte {
	out := uleb(uint32(len(name)))
	return append(out, []byte(name)...)
}

func encodeSection(id byte, body []byte) []byte {
	out := []byte{id}
	out = append(out, uleb(uint32(len(body)))...)
	return append(out, body...)
}

func TestValidateStepModuleAcceptsCleanModule(t *testing.T) {
	wasm := buildWasm(t, 0, []string{"step"})
	if err := validateStepModule(wasm); err != nil {
		t.Fatalf("expected a clean module to validate, got: %v", err)
	}
}

func TestValidateStepModuleRejectsImports(t *testing.T) {
	wasm := buildWasm(t, 1, []string{"step"})
	err := validateStepModule(wasm)
	if err == nil || !strings.Contains(err.Error(), "imports") {
		t.Fatalf("expected an imports rejection, got: %v", err)
	}
}

func TestValidateStepModuleRejectsWrongExportName(t *testing.T) {
	wasm := buildWasm(t, 0, []string{"run"})
	err := validateStepModule(wasm)
	if err == nil || !strings.Contains(err.Error(), "step") {
		t.Fatalf("expected a wrong-export rejection, got: %v", err)
	}
}

func TestValidateStepModuleRejectsMultipleFunctionExports(t *testing.T) {
	wasm := buildWasm(t, 0, []string{"step", "extra"})
	if err := validateStepModule(wasm); err == nil {
		t.Fatal("expected multiple function exports to be rejected")
	}
}

func TestValidateStepModuleRejectsTruncatedInput(t *testing.T) {
	if err := validateStepModule([]byte{0x00, 0x61}); err == nil {
		t.Fatal("expected a truncated module to be rejected")
	}
}

func TestSplitMatchAction(t *testing.T) {
	id, action, ok := splitMatchAction("match-123/tick")
	if !ok || id != "match-123" || action != "tick" {
		t.Fatalf("unexpected split result: id=%q action=%q ok=%v", id, action, ok)
	}
	if _, _, ok := splitMatchAction("no-slash-here"); ok {
		t.Fatal("expected a path with no slash to fail to split")
	}
}
