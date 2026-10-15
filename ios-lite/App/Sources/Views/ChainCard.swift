import SwiftUI
import CapitalForgeLiteKit

/// Zincir kartı: üç kademe yan yana, darboğaz halkalı, altında marj ve
/// rakiple pay. Kilitliyse açılış eşiğine ilerleme.
struct ChainCard: View {
    @Environment(GameStore.self) private var store
    let chain: ChainId

    var body: some View {
        let state = store.state
        if Lite.chainUnlocked(state, chain) {
            unlocked(state)
        } else {
            locked(state)
        }
    }

    private func unlocked(_ state: LiteState) -> some View {
        let report = Lite.chainReport(state, chain)
        let hasRetail = state[chain: chain].levels[2] > 0
        let colors = Theme.chainColors(chain)
        return VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 9) {
                IconTile(symbol: Theme.chainIcon(chain), colors: colors, size: 34)
                Text(L10n.chainName(chain))
                    .font(Theme.display(20))
                    .foregroundStyle(Theme.ink)
                Text(L10n.districtName(LiteContent.chain(chain).district).uppercased(with: L10n.locale))
                    .font(Theme.caps(9.5))
                    .tracking(0.6)
                    .foregroundStyle(Theme.soft)
                if Lite.featuredChain(state) == chain {
                    Pill(text: "×2", symbol: "star.fill")
                }
                Spacer(minLength: 4)
                Text(L10n.t("header.income", Format.money(report.income)))
                    .font(Theme.display(16))
                    .foregroundStyle(Theme.money)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }
            HStack(spacing: 6) {
                ForEach(Stage.allCases, id: \.self) { stage in
                    StageButton(chain: chain, stage: stage, bottleneck: hasRetail && report.bottleneck == stage)
                }
            }
            if hasRetail {
                HStack(spacing: 10) {
                    Text(L10n.t("chain.margin", Format.percent(report.margin)))
                    ShareBar(share: report.share, colors: colors)
                    Text(L10n.t("chain.share", Format.percent(report.share)))
                }
                .font(Theme.text(12))
                .foregroundStyle(Theme.muted)
            } else {
                Text(L10n.t("chain.noRetail", L10n.stageName(chain, .retail)))
                    .font(Theme.text(12))
                    .foregroundStyle(Theme.warn)
            }
            if chain == .energy {
                // L7: şebeke diğer zincirlerin işlemesini hızlandırıyor.
                let powered = Lite.gridPowered(state)
                Label(L10n.t(powered ? "energy.gridOn" : "energy.grid"), systemImage: powered ? "bolt.circle.fill" : "bolt.circle")
                    .font(Theme.text(11.5, .heavy))
                    .foregroundStyle(powered ? Theme.money : Theme.muted)
            }
        }
        .glassCard()
        .accessibilityIdentifier("chain-\(chain.rawValue)")
    }

    private func locked(_ state: LiteState) -> some View {
        let target = max(LiteContent.chain(chain).unlockAt, LiteContent.district(LiteContent.chain(chain).district).unlockAt)
        let progress = min(1, state.earned / max(1, target))
        return VStack(alignment: .leading, spacing: 9) {
            HStack(spacing: 9) {
                Image(systemName: "lock.fill")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(Theme.soft)
                    .frame(width: 34, height: 34)
                    .background(Theme.track, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                Text(L10n.chainName(chain)).font(Theme.display(18)).foregroundStyle(Theme.muted)
                Text(L10n.districtName(LiteContent.chain(chain).district).uppercased(with: L10n.locale))
                    .font(Theme.caps(9.5))
                    .tracking(0.6)
                    .foregroundStyle(Theme.soft)
                Spacer()
            }
            ProgressBar(value: progress, colors: Theme.chainColors(chain))
            Text(L10n.t("chain.locked", Format.money(target)))
                .font(Theme.text(11.5))
                .foregroundStyle(Theme.muted)
        }
        .glassCard()
        .opacity(0.85)
    }
}

/// Bir kademe: rol, ad, seviye ve hız, kilometre taşına ilerleme, alım düğmesi.
struct StageButton: View {
    @Environment(GameStore.self) private var store
    let chain: ChainId
    let stage: Stage
    let bottleneck: Bool

    var body: some View {
        let state = store.state
        let level = state[chain: chain].levels[stage.rawValue]
        let affordable = store.canBuy(chain, stage)
        let shape = RoundedRectangle(cornerRadius: 16, style: .continuous)
        VStack(alignment: .leading, spacing: 3) {
            HStack(spacing: 2) {
                Text(L10n.stageRole(stage).uppercased(with: L10n.locale))
                    .font(Theme.caps(9))
                    .tracking(0.5)
                    .foregroundStyle(Theme.soft)
                    .lineLimit(1)
                Spacer(minLength: 0)
                if bottleneck {
                    Pill(text: L10n.t("chain.bottleneck").uppercased(with: L10n.locale), symbol: "bolt.fill", font: Theme.text(7.5, .heavy))
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                }
            }
            .frame(minHeight: 15)
            Text(L10n.stageName(chain, stage))
                .font(Theme.display(13))
                .foregroundStyle(Theme.ink)
                .lineLimit(1)
                .minimumScaleFactor(0.75)
            Text(L10n.t("stage.level", level) + (level > 0 ? " · " + L10n.t("stage.rate", Format.number(Lite.stageRate(stage, level))) : ""))
                .font(Theme.text(10.5))
                .foregroundStyle(Theme.muted)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            MilestoneBar(level: level)
            Button {
                store.buy(chain, stage)
            } label: {
                Text(Format.money(store.cost(for: chain, stage)) + countSuffix)
                    .font(Theme.display(14))
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                    .padding(.horizontal, 4)
                    .frame(maxWidth: .infinity, minHeight: 34)
            }
            .buttonStyle(.glossy(affordable ? Theme.orange : nil, radius: 13))
            .padding(.top, 3)
            .accessibilityIdentifier("stage-\(chain.rawValue)-\(stage.rawValue)")
        }
        .padding(8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(bottleneck ? Theme.neck : Theme.tile, in: shape)
        .overlay(shape.strokeBorder(bottleneck ? Theme.neckRing : .clear, lineWidth: 2))
    }

    private var countSuffix: String {
        let count = store.count(for: chain, stage)
        return count > 1 ? " ×\(count)" : ""
    }
}

/// Kilometre taşına (hız ×2) ilerleme: bir önceki taştan bir sonrakine.
struct MilestoneBar: View {
    let level: Int

    var body: some View {
        let previous = LiteContent.milestones.last { $0 <= level } ?? 0
        let next = Lite.nextMilestone(level)
        let progress = next.map { Double(level - previous) / Double(max(1, $0 - previous)) } ?? 1
        ProgressBar(value: level > 0 ? progress : 0, colors: (Color(hex: 0x8ED36C), Color(hex: 0x4FBF4A)), height: 6)
            .accessibilityLabel(next.map { L10n.t("stage.next", $0 - level) } ?? "")
    }
}

/// Yuvarlak dolum çubuğu.
struct ProgressBar: View {
    let value: Double
    let colors: (Color, Color)
    var height: CGFloat = 8
    var track: Color = Theme.track

    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .leading) {
                Capsule().fill(track)
                Capsule()
                    .fill(LinearGradient(colors: [colors.0, colors.1], startPoint: .leading, endPoint: .trailing))
                    .frame(width: max(value > 0 ? height : 0, proxy.size.width * min(1, max(0, value))))
            }
        }
        .frame(height: height)
    }
}

/// Pay çubuğu: dolu kısım senin, boş kısım rakibin.
struct ShareBar: View {
    let share: Double
    let colors: (Color, Color)

    var body: some View {
        ProgressBar(value: share, colors: colors, height: 10, track: Theme.rivalTrack)
    }
}
