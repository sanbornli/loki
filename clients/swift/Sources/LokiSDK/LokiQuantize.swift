import Foundation

public enum LokiQuantizeError: Error, Sendable {
    case notFinite
    case invalidScale
    case outOfRange
}

public enum LokiQuantize {
    public static func quantize(_ value: Double, scale: Int64) throws -> Int64 {
        guard value.isFinite else { throw LokiQuantizeError.notFinite }
        guard scale > 0 else { throw LokiQuantizeError.invalidScale }
        let scaled = (value * Double(scale)).rounded()
        guard scaled >= Double(Int64.min) && scaled <= Double(Int64.max) else {
            throw LokiQuantizeError.outOfRange
        }
        return Int64(scaled)
    }

    public static func dequantize(_ value: Int64, scale: Int64) throws -> Double {
        guard scale > 0 else { throw LokiQuantizeError.invalidScale }
        return Double(value) / Double(scale)
    }
}
