import SwiftUI
import CapitalForgeLiteKit

/// Zincir kartı: üç kademe yan yana, darboğaz vurgulu, altında marj ve
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
        return VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Rectangle().fill(Theme.chain(chain)).frame(width: 10, height: 10)
                Text(L10n.chainName(chain))
                    .font(Theme.sans(16, .bold))
                    .foregroundStyle(Theme.ink)
                Text(L10n.districtName(Content.chain(chain).district).uppercased())
                    .font(Theme.mono(9, .medium))
                    .foregroundStyle(Theme.muted)
                    .tracking(0.8)
                Spacer()
                Text(L10n.t("header.income", Format.money(report.income)))
                    .font(Theme.mono(13, .semibold))
                    .foregroundStyle(Theme.money)
            }
            HStack(spacing: 6) {
                ForEach(Stage.allCases, id: \.self) { stage in
                    StageButton(chain: chain, stage: stage, bottleneck: hasRetail && report.bottleneck == stage)
                }
            }
            if hasRetail {
                HStack(spacing: 10) {
                    Text(L10n.t("chain.margin", Format.percent(report.margin)))
                    ShareBar(share: report.share, color: Theme.chain(chain))
                    Text(L10n.t("chain.share", Format.percent(report.share)))
                }
                .font(Theme.mono(11))
                .foregroundStyle(Theme.muted)
            } else {
                Text(L10n.t("chain.noRetail", L10n.stageName(chain, .retail)))
                    .font(Theme.sans(12))
                    .foregroundStyle(Theme.warn)
            }
        }
        .padding(12)
        .ruled()
        .accessibilityIdentifier("chain-\(chain.rawValue)")
    }

    private func locked(_ state: LiteState) -> some View {
        let target = max(Content.chain(chain).unlockAt, Content.district(Content.chain(chain).district).unlockAt)
        let progress = min(1, state.earned / max(1, target))
        return VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Image(systemName: "lock.fill").font(.system(size: 11)).foregroundStyle(Theme.muted)
                Text(L10n.chainName(chain)).font(Theme.sans(16, .semibold)).foregroundStyle(Theme.muted)
                Text(L10n.districtName(Content.chain(chain).district).uppercased())
                    .font(Theme.mono(9, .medium))
                    .foregroundStyle(Theme.muted)
                    .tracking(0.8)
                Spacer()
            }
            ProgressView(value: progress).tint(Theme.ink)
            Text(L10n.t("chain.locked", Format.money(target)))
                .font(Theme.mono(11))
                .foregroundStyle(Theme.muted)
        }
        .padding(12)
        .background(Theme.accentSoft)
        .overlay(Rectangle().stroke(Theme.line, style: StrokeStyle(lineWidth: 1, dash: [4, 3])))
    }
}

/// Bir kademe: ad, seviye, hız, kilometre taşına kalan ve alım düğmesi.
struct StageButton: View {
    @Environment(GameStore.self) private var store
    let chain: ChainId
    let stage: Stage
    let bottleneck: Bool

    var body: some View {
        let state = store.state
        let level = state[chain: chain].levels[stage.rawValue]
        let affordable = store.canBuy(chain, stage)
        Button {
            store.buy(chain, stage)
        } label: {
            VStack(alignment: .leading, spacing: 3) {
                HStack {
                    Text(L10n.stageRole(stage).uppercased())
                        .font(Theme.mono(9, .medium))
                        .tracking(0.6)
                    Spacer(minLength: 0)
                    if bottleneck {
                        Text(L10n.t("chain.bottleneck").uppercased())
                            .font(Theme.mono(8, .bold))
                            .padding(.horizontal, 3)
                            .padding(.vertical, 1)
                            .background(Theme.warn)
                            .foregroundStyle(Theme.panel)
                    }
                }
                .foregroundStyle(Theme.muted)
                Text(L10n.stageName(chain, stage))
                    .font(Theme.sans(12, .semibold))
                    .foregroundStyle(Theme.ink)
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)
                Text(L10n.t("stage.level", level) + (level > 0 ? " · " + L10n.t("stage.rate", Format.number(Lite.stageRate(stage, level))) : ""))
                    .font(Theme.mono(10))
                    .foregroundStyle(Theme.muted)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                if let next = Lite.nextMilestone(level), level > 0 {
                    Text(L10n.t("stage.next", next - level))
                        .font(Theme.mono(9))
                        .foregroundStyle(Theme.muted.opacity(0.8))
                }
                Text(Format.money(store.cost(for: chain, stage)) + countSuffix)
                    .font(Theme.mono(11, .bold))
                    .frame(maxWidth: .infinity, minHeight: 26)
                    .foregroundStyle(affordable ? Theme.paper : Theme.muted)
                    .background(affordable ? Theme.ink : Theme.accentSoft)
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
            }
            .padding(7)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(bottleneck ? Theme.warn.opacity(0.08) : Theme.panel)
            .overlay(Rectangle().stroke(bottleneck ? Theme.warn : Theme.line, lineWidth: bottleneck ? 1.5 : 1))
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("stage-\(chain.rawValue)-\(stage.rawValue)")
    }

    private var countSuffix: String {
        let count = store.count(for: chain, stage)
        return count > 1 ? " ×\(count)" : ""
    }
}

/// Pay çubuğu: dolu kısım senin, boş kısım rakibin.
struct ShareBar: View {
    let share: Double
    let color: Color

    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .leading) {
                Rectangle().fill(Theme.bad.opacity(0.25))
                Rectangle().fill(color).frame(width: proxy.size.width * share)
            }
        }
        .frame(height: 6)
    }
}
