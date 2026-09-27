(module
  (memory (export "memory") 16)
  (func (export "step") (param $inputLen i32) (param $stateLen i32) (result i32)
    ;; 100 pages is 6.4 MiB, above the worker's per-isolate page cap.
    ;; A rejected grow returns -1; trap so the limit is a kill, not a soft miss.
    (if (i32.eq (memory.grow (i32.const 100)) (i32.const -1))
      (then (unreachable))
    )
    (i32.const 4)
  )
)
