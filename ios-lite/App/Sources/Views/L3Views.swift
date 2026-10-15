import SwiftUI
import CapitalForgeLiteKit

/// Olay şeridi: süren olay (ve yürürlükteki politika) geri sayımıyla.
/// Şehrin üstünde, başparmağın değil gözün olduğu yerde.
struct EventBanner: View {
    @Environment(GameStore.self) private var store

    var body: some View {
        let state = store.state
        if state.event != nil || state.policy != nil {
            VStack(alignment: .leading, spacing: 4) {
                if let event = state.event {
                    HStack(spacing: 8) {
                        Image(systemName: icon(event.kind))
                            .font(.system(size: 13, weight: .bold))
                        VStack(alignment: .leading, spacing: 1) {
                            Text(L10n.eventTitle(event)).font(Theme.sans(13, .bold))
                            Text(L10n.eventBody(event)).font(Theme.sans(11)).lineLimit(1).minimumScaleFactor(0.8)
                        }
                        Spacer(minLength: 4)
                        Text(Format.duration(event.until - state.clock)).font(Theme.mono(12, .bold))
                    }
                    .foregroundStyle(tone(event.kind))
                    .accessibilityIdentifier("event-\(event.kind.rawValue)")
                }
                if let policy = state.policy {
                    Text(L10n.t("council.active", L10n.policyTitle(policy.kind), Format.duration(policy.until - state.clock)))
                        .font(Theme.mono(10, .medium))
                        .foregroundStyle(Theme.muted)
                        .accessibilityIdentifier("policy")
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 7)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Theme.panel.opacity(0.94))
            .overlay(alignment: .bottom) { Rectangle().fill(Theme.line).frame(height: 1) }
        }
    }

    private func icon(_ kind: EventKind) -> String {
        switch kind {
        case .tourism: "sun.max.fill"
        case .crisis: "exclamationmark.triangle.fill"
        case .strike: "hand.raised.fill"
        case .fashionWeek: "sparkles"
        case .exportBoom: "shippingbox.fill"
        case .rivalPush: "flame.fill"
        }
    }

    private func tone(_ kind: EventKind) -> Color {
        switch kind {
        case .tourism, .fashionWeek, .exportBoom: Theme.good
        case .crisis, .strike, .rivalPush: Theme.bad
        }
    }
}

/// Meclis kartı: açık oturumun iki seçeneği. Seçim bir saat yürürlükte.
struct CouncilCard: View {
    @Environment(GameStore.self) private var store

    var body: some View {
        if let pair = store.state.council {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Image(systemName: "building.columns.fill")
                    Text(L10n.t("council.title")).font(Theme.sans(15, .bold))
                    Spacer()
                }
                Text(L10n.t("council.body")).font(Theme.sans(12)).foregroundStyle(Theme.muted)
                HStack(spacing: 8) {
                    ForEach(0..<2, id: \.self) { choice in
                        let kind = LiteContent.councilPairs[pair][choice]
                        Button {
                            store.chooseCouncil(choice)
                        } label: {
                            VStack(alignment: .leading, spacing: 3) {
                                Text(L10n.policyTitle(kind)).font(Theme.sans(13, .bold)).foregroundStyle(Theme.paper)
                                Text(L10n.policyBody(kind)).font(Theme.mono(10)).foregroundStyle(Theme.paper.opacity(0.8))
                                    .lineLimit(2)
                                    .minimumScaleFactor(0.8)
                            }
                            .padding(10)
                            .frame(maxWidth: .infinity, minHeight: 62, alignment: .leading)
                            .background(Theme.ink)
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("council-\(choice)")
                    }
                }
            }
            .padding(12)
            .ruled(strong: true)
        }
    }
}

/// Görev kartı: sıradaki görev ve ödülü. Şart tutunca düğme parlıyor.
struct GoalCard: View {
    @Environment(GameStore.self) private var store

    var body: some View {
        let state = store.state
        let total = LiteContent.goals.count
        if let goal = Lite.currentGoal(state) {
            let met = Lite.goalMet(state, goal)
            HStack(spacing: 10) {
                Image(systemName: met ? "checkmark.seal.fill" : "flag.checkered")
                    .font(.system(size: 20))
                    .foregroundStyle(met ? Theme.good : Theme.ink)
                VStack(alignment: .leading, spacing: 2) {
                    Text(L10n.t("goal.title", state.goal + 1, total).uppercased())
                        .font(Theme.mono(9, .medium))
                        .tracking(0.8)
                        .foregroundStyle(Theme.muted)
                    Text(L10n.goalTitle(goal.kind))
                        .font(Theme.sans(14, .bold))
                        .foregroundStyle(Theme.ink)
                }
                Spacer(minLength: 6)
                Button {
                    store.claimGoal()
                } label: {
                    Text(met ? L10n.t("goal.claim", Format.money(Lite.goalReward(state, goal))) : L10n.t("goal.pending", Format.duration(goal.rewardSeconds)))
                        .font(Theme.mono(11, .bold))
                        .padding(.horizontal, 10)
                        .frame(minHeight: 34)
                        .foregroundStyle(met ? Theme.paper : Theme.muted)
                        .background(met ? Theme.good : Theme.accentSoft)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                }
                .buttonStyle(.plain)
                .disabled(!met)
                .accessibilityIdentifier("goal-claim")
            }
            .padding(12)
            .ruled()
        } else {
            Text(L10n.t("goal.done"))
                .font(Theme.sans(12))
                .foregroundStyle(Theme.muted)
                .padding(12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .ruled()
        }
    }
}
