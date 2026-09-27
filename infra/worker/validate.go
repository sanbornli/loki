package main

import (
	"errors"
	"unicode/utf8"
)

// A defense-in-depth re-check of the same structural rule the upload
// boundary (apps/api/src/step-module.ts) already enforced: a server-
// authority module may import nothing and must export exactly one
// function, "step". The worker never trusts a fetched module on hash
// match alone; it walks the binary itself before ever instantiating it.

const (
	sectionImport = 2
	sectionExport = 7

	exportKindFunction = 0
)

var (
	wasmMagic   = []byte{0x00, 0x61, 0x73, 0x6d}
	wasmVersion = []byte{0x01, 0x00, 0x00, 0x00}
)

type moduleShape struct {
	importCount         int
	functionExportCount int
	functionExportName  string
}

type byteReader struct {
	bytes  []byte
	offset int
}

func (r *byteReader) remaining() int {
	return len(r.bytes) - r.offset
}

func (r *byteReader) readByte() (byte, error) {
	if r.offset >= len(r.bytes) {
		return 0, errors.New("step module ended unexpectedly")
	}
	b := r.bytes[r.offset]
	r.offset++
	return b, nil
}

func (r *byteReader) readBytes(length int) ([]byte, error) {
	if length < 0 || r.offset+length > len(r.bytes) {
		return nil, errors.New("step module ended unexpectedly")
	}
	slice := r.bytes[r.offset : r.offset+length]
	r.offset += length
	return slice, nil
}

// readU32Leb reads an unsigned LEB128 varuint32; WebAssembly never encodes
// one in more than 5 bytes.
func (r *byteReader) readU32Leb() (uint32, error) {
	var result uint32
	var shift uint
	for i := 0; i < 5; i++ {
		b, err := r.readByte()
		if err != nil {
			return 0, err
		}
		result |= uint32(b&0x7f) << shift
		if b&0x80 == 0 {
			return result, nil
		}
		shift += 7
	}
	return 0, errors.New("malformed step module (varuint32 too long)")
}

// parseModuleShape walks section headers just far enough to count imports
// and collect function export names; it never decodes function bodies.
func parseModuleShape(bytes []byte) (moduleShape, error) {
	if len(bytes) < 8 {
		return moduleShape{}, errors.New("not a WebAssembly module")
	}
	for i := 0; i < 4; i++ {
		if bytes[i] != wasmMagic[i] {
			return moduleShape{}, errors.New("missing WebAssembly magic bytes")
		}
	}
	for i := 0; i < 4; i++ {
		if bytes[4+i] != wasmVersion[i] {
			return moduleShape{}, errors.New("unsupported WebAssembly binary version")
		}
	}
	reader := &byteReader{bytes: bytes, offset: 8}
	shape := moduleShape{}
	functionExportNames := 0
	for reader.remaining() > 0 {
		sectionID, err := reader.readByte()
		if err != nil {
			return moduleShape{}, err
		}
		sectionSize, err := reader.readU32Leb()
		if err != nil {
			return moduleShape{}, err
		}
		sectionStart := reader.offset
		switch sectionID {
		case sectionImport:
			count, err := reader.readU32Leb()
			if err != nil {
				return moduleShape{}, err
			}
			shape.importCount = int(count)
		case sectionExport:
			count, err := reader.readU32Leb()
			if err != nil {
				return moduleShape{}, err
			}
			for i := uint32(0); i < count; i++ {
				nameLength, err := reader.readU32Leb()
				if err != nil {
					return moduleShape{}, err
				}
				nameBytes, err := reader.readBytes(int(nameLength))
				if err != nil {
					return moduleShape{}, err
				}
				if !utf8.Valid(nameBytes) {
					return moduleShape{}, errors.New("export name is not valid UTF-8")
				}
				kind, err := reader.readByte()
				if err != nil {
					return moduleShape{}, err
				}
				if _, err := reader.readU32Leb(); err != nil { // export index; unused
					return moduleShape{}, err
				}
				if kind == exportKindFunction {
					functionExportNames++
					shape.functionExportName = string(nameBytes)
				}
			}
		}
		consumed := reader.offset - sectionStart
		left := int(sectionSize) - consumed
		if left < 0 {
			return moduleShape{}, errors.New("malformed WebAssembly section")
		}
		if left > 0 {
			if _, err := reader.readBytes(left); err != nil {
				return moduleShape{}, err
			}
		}
	}
	if functionExportNames != 1 {
		shape.functionExportName = ""
	}
	shape.functionExportCount = functionExportNames
	return shape, nil
}

// validateStepModule re-runs the upload boundary's rule: no imports, and
// exactly one function export named "step".
func validateStepModule(bytes []byte) error {
	shape, err := parseModuleShape(bytes)
	if err != nil {
		return err
	}
	if shape.importCount > 0 {
		return errors.New("step module imports host values; server-authority modules may import nothing")
	}
	if shape.functionExportCount != 1 || shape.functionExportName != "step" {
		return errors.New(`step module must export exactly one function, "step"`)
	}
	return nil
}
