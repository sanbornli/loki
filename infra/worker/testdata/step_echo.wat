(module
  (memory (export "memory") 16)
  (func (export "step") (param $inputLen i32) (param $stateLen i32) (result i32)
    (local $i i32)
    (block $done
      (loop $loop
        (br_if $done (i32.ge_u (local.get $i) (local.get $inputLen)))
        (i32.store8
          (i32.add (i32.const 524288) (local.get $i))
          (i32.load8_u (i32.add (i32.const 0) (local.get $i))))
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $loop)
      )
    )
    (local.get $inputLen)
  )
)
