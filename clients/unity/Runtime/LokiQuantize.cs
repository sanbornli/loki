using System;

namespace Loki.Play.SDK
{
    public static class LokiQuantize
    {
        public static long Quantize(double value, long scale)
        {
            if (double.IsNaN(value) || double.IsInfinity(value))
                throw new ArgumentOutOfRangeException(nameof(value), "quantize requires a finite value");
            if (scale <= 0)
                throw new ArgumentOutOfRangeException(nameof(scale), "quantize requires a positive safe-integer scale");
            var quantized = Math.Round(value * scale);
            if (quantized < long.MinValue || quantized > long.MaxValue)
                throw new OverflowException("quantized value is not a finite safe integer");
            return (long)quantized;
        }

        public static double Dequantize(long value, long scale)
        {
            if (scale <= 0)
                throw new ArgumentOutOfRangeException(nameof(scale), "dequantize requires a positive safe-integer scale");
            return (double)value / scale;
        }
    }
}
