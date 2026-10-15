import AVFoundation

/// Prosedürel sesler: hiçbir ses dosyası yok. Her ses birkaç kısa sinüs
/// notasından oluşan bir tampon; açılışta bir kez üretiliyor.
///
/// Oturum "ambient": telefonun sessiz anahtarına uyuyor ve çalan müziği
/// kesmiyor. Bir idle oyunun sesi arka plandaki podcast'i susturmamalı.
@MainActor
final class SoundPlayer {
    enum Cue: CaseIterable {
        /// Alım: kısa, yumuşak bir tık.
        case buy
        /// Kilometre taşı (hız ×2): iki nota yukarı.
        case milestone
        /// Görev ödülü, meclis kararı: üç notalı arpej.
        case reward
        /// Kasa yetmedi: alçak, kısa.
        case refuse
        /// Olay başladı: iki nota aşağı, sessizce.
        case event
        /// Halka arz ve şehir satışı: dört notalı, biraz daha uzun.
        case fanfare
    }

    private let engine = AVAudioEngine()
    private let player = AVAudioPlayerNode()
    private let format = AVAudioFormat(standardFormatWithSampleRate: 44_100, channels: 1)!
    private var buffers: [Cue: AVAudioPCMBuffer] = [:]
    private var ready = false
    private var failed = false

    /// (frekans Hz, süre sn) notaları art arda.
    private static func notes(_ cue: Cue) -> [(Double, Double)] {
        switch cue {
        case .buy: [(1_320, 0.035)]
        case .milestone: [(660, 0.07), (990, 0.11)]
        case .reward: [(523, 0.07), (659, 0.07), (784, 0.13)]
        case .refuse: [(196, 0.09)]
        case .event: [(740, 0.09), (554, 0.14)]
        case .fanfare: [(523, 0.08), (659, 0.08), (784, 0.08), (1_047, 0.22)]
        }
    }

    private static func volume(_ cue: Cue) -> Float {
        switch cue {
        case .buy: 0.10
        case .refuse: 0.16
        case .event: 0.14
        default: 0.18
        }
    }

    func play(_ cue: Cue) {
        guard prepare(), let buffer = buffers[cue] else { return }
        if !engine.isRunning {
            do { try engine.start() } catch { return }
        }
        // Yeni ses eskisini kesiyor: hızlı art arda alımlarda sesler kuyruğa girip gecikmesin.
        player.scheduleBuffer(buffer, at: nil, options: .interrupts)
        if !player.isPlaying { player.play() }
    }

    private func prepare() -> Bool {
        if ready { return true }
        if failed { return false }
        do {
            try AVAudioSession.sharedInstance().setCategory(.ambient, options: [.mixWithOthers])
            try AVAudioSession.sharedInstance().setActive(true)
            engine.attach(player)
            engine.connect(player, to: engine.mainMixerNode, format: format)
            for cue in Cue.allCases { buffers[cue] = makeBuffer(cue) }
            try engine.start()
            ready = true
        } catch {
            failed = true
        }
        return ready
    }

    private func makeBuffer(_ cue: Cue) -> AVAudioPCMBuffer? {
        let rate = format.sampleRate
        let notes = Self.notes(cue)
        let total = notes.reduce(0) { $0 + $1.1 }
        let frames = AVAudioFrameCount(total * rate)
        guard let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frames),
              let samples = buffer.floatChannelData?[0] else { return nil }
        buffer.frameLength = frames
        let volume = Self.volume(cue)
        var index = 0
        for (frequency, duration) in notes {
            let count = Int(duration * rate)
            for n in 0..<count where index < Int(frames) {
                let t = Double(n) / rate
                // 4 ms giriş, sonra üstel sönüm: tık sesi yok, çan gibi bitiyor.
                let attack = min(1, t / 0.004)
                let decay = exp(-t / (duration * 0.45))
                let tone = sin(2 * .pi * frequency * t) + 0.25 * sin(4 * .pi * frequency * t)
                samples[index] = Float(tone * attack * decay) * volume
                index += 1
            }
        }
        while index < Int(frames) {
            samples[index] = 0
            index += 1
        }
        return buffer
    }
}
