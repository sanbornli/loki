package play.loki.sdk

import kotlin.math.round

object LokiQuantize {
    fun quantize(value: Double, scale: Long): Long {
        require(value.isFinite()) { "quantize requires a finite value" }
        require(scale > 0) { "quantize requires a positive safe-integer scale" }
        val quantized = round(value * scale)
        require(quantized.isFinite() && quantized >= Long.MIN_VALUE.toDouble() && quantized <= Long.MAX_VALUE.toDouble()) {
            "quantized value is not a finite safe integer"
        }
        return quantized.toLong()
    }

    fun dequantize(value: Long, scale: Long): Double {
        require(scale > 0) { "dequantize requires a positive safe-integer scale" }
        return value.toDouble() / scale
    }
}
