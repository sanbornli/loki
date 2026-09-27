(module
  (memory (export "memory") 16)
  (func (export "step") (param $inputLen i32) (param $stateLen i32) (result i32)
    (loop $forever
      (br $forever)
    )
    (i32.const 4)
  )
)
