import SwiftUI
import CapitalForgeLiteKit

/// Olay şeridi: başlıkla şehir arasında sabit yükseklikte bir cam şerit. Olay
/// varsa olay ve geri sayımı, yoksa sıradaki olaya kalan süre; yürürlükteki
/// politika sağda. Yüksekliği sabit: olay gelince ekran zıplamıyor.
struct EventBanner: View {
    @Environment(GameStore.self) private var store

    var body: some View {
        let state = store.state
        HStack(spacing: 10) {
            if let event = state.event {
                IconTile(symbol: icon(event.kind), colors: tone(event.kind), size: 30)
                VStack(alignment: .leading, spacing: 0) {
                    Text(L10n.eventTitle(event)).font(Theme.display(15)).foregroundStyle(good(event.kind) ? Theme.eventTitle : Theme.bad)
                    Text(L10n.eventBody(event)).font(Theme.text(11.5)).foregroundStyle(Theme.eventText)
                        .lineLimit(1).minimumScaleFactor(0.75)
                }
                .accessibilityIdentifier("event-\(event.kind.rawValue)")
            } else {
                Image(systemName: "clock.fill")
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(Theme.soft)
                    .frame(width: 30, height: 30)
                // Kapalıyken kaçan olay dönüşte ilk tıkta başlıyor: "0 sn" yerine "başlıyor".
                Text(state.nextEventAt - state.clock < 1
                     ? L10n.t("event.soon")
                     : L10n.t("event.next", Format.duration(state.nextEventAt - state.clock)))
                    .font(Theme.text(12.5))
                    .foregroundStyle(Theme.muted)
            }
            Spacer(minLength: 6)
            VStack(alignment: .trailing, spacing: 2) {
                if let event = state.event {
                    Text(Format.duration(event.until - state.clock))
                        .font(Theme.display(13.5))
                        .foregroundStyle(good(event.kind) ? Theme.eventTitle : Theme.bad)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 2)
                        .background(Theme.tile, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                }
                if let policy = state.policy {
                    Text(L10n.policyTitle(policy.kind) + " · " + Format.duration(policy.until - state.clock))
                        .font(Theme.text(10, .heavy))
                        .foregroundStyle(Theme.muted)
                        .lineLimit(1)
                        .accessibilityIdentifier("policy")
                }
            }
        }
        .padding(.horizontal, 12)
        .frame(height: 50)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(state.event.map { good($0.kind) ? Theme.eventFill : Theme.badFill } ?? Theme.card, in: RoundedRectangle(cornerRadius: 17, style: .continuous))
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 17, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 17, style: .continuous).strokeBorder(state.event == nil ? Theme.cardBorder : Theme.eventEdge, lineWidth: 1))
        .padding(.horizontal, 14)
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

    private func good(_ kind: EventKind) -> Bool {
        switch kind {
        case .tourism, .fashionWeek, .exportBoom: true
        case .crisis, .strike, .rivalPush: false
        }
    }

    private func tone(_ kind: EventKind) -> (Color, Color) {
        switch kind {
        case .tourism: (Color(hex: 0xFFD45E), Color(hex: 0xFFB020))
        case .fashionWeek: (Color(hex: 0xE59BF5), Color(hex: 0xC062DE))
        case .exportBoom: (Color(hex: 0x6FD4FF), Color(hex: 0x2E9CE8))
        case .crisis, .strike, .rivalPush: (Color(hex: 0xFF8A8A), Color(hex: 0xE04848))
        }
    }
}

/// Meclis kartı: açık oturumun iki seçeneği. Seçim bir saat yürürlükte.
struct CouncilCard: View {
    @Environment(GameStore.self) private var store

    var body: some View {
        if let pair = store.state.council {
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 10) {
                    IconTile(symbol: "building.columns.fill", colors: (Color(hex: 0x7DB4FF), Color(hex: 0x4683E8)), size: 34)
                    VStack(alignment: .leading, spacing: 0) {
                        Text(L10n.t("council.title")).font(Theme.display(17)).foregroundStyle(Theme.ink)
                        Text(L10n.t("council.body")).font(Theme.text(11.5)).foregroundStyle(Theme.muted)
                    }
                    Spacer()
                }
                HStack(spacing: 8) {
                    ForEach(0..<2, id: \.self) { choice in
                        let kind = LiteContent.councilPairs[pair][choice]
                        Button {
                            store.chooseCouncil(choice)
                        } label: {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(L10n.policyTitle(kind)).font(Theme.display(14))
                                Text(L10n.policyBody(kind)).font(Theme.text(11)).opacity(0.9)
                                    .lineLimit(2)
                                    .minimumScaleFactor(0.8)
                            }
                            .padding(.horizontal, 11)
                            .padding(.vertical, 9)
                            .frame(maxWidth: .infinity, minHeight: 58, alignment: .leading)
                        }
                        .buttonStyle(.glossy(choice == 0 ? Theme.blue : Theme.orange, radius: 15))
                        .accessibilityIdentifier("council-\(choice)")
                    }
                }
            }
            .glassCard()
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
            HStack(spacing: 11) {
                IconTile(symbol: met ? "checkmark.seal.fill" : "flag.fill",
                         colors: met ? (Color(hex: 0x4FD88C), Color(hex: 0x22B262)) : (Color(hex: 0x7DB4FF), Color(hex: 0x4683E8)),
                         size: 38)
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 6) {
                        Text(L10n.t("goal.title", state.goal + 1, total).uppercased(with: L10n.locale))
                            .font(Theme.caps(10))
                            .tracking(0.6)
                            .foregroundStyle(Theme.soft)
                        GoalPips(done: state.goal, total: total)
                    }
                    Text(L10n.goalTitle(goal.kind))
                        .font(Theme.display(16.5))
                        .foregroundStyle(Theme.ink)
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                }
                Spacer(minLength: 6)
                Button {
                    store.claimGoal()
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: met ? "gift.fill" : "hourglass")
                            .font(.system(size: 13, weight: .bold))
                        Text(met ? "+" + Format.money(Lite.goalReward(state, goal)) : L10n.t("goal.pendingShort", Format.duration(goal.rewardSeconds)))
                            .font(Theme.display(14))
                            .lineLimit(1)
                            .minimumScaleFactor(0.7)
                    }
                    .padding(.horizontal, 12)
                    .frame(height: 40)
                }
                .buttonStyle(.glossy(met ? Theme.green : nil, radius: 15))
                .disabled(!met)
                .accessibilityLabel(met ? L10n.t("goal.claim", Format.money(Lite.goalReward(state, goal))) : L10n.t("goal.pending", Format.duration(goal.rewardSeconds)))
                .accessibilityIdentifier("goal-claim")
            }
            .glassCard()
        } else {
            HStack(spacing: 10) {
                IconTile(symbol: "trophy.fill", colors: (Color(hex: 0xFFE08A), Color(hex: 0xFFB938)), size: 34)
                Text(L10n.t("goal.done"))
                    .font(Theme.text(12.5))
                    .foregroundStyle(Theme.muted)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .glassCard()
        }
    }
}

/// Görev merdiveninin son dört basamağı: dolanlar yeşil.
struct GoalPips: View {
    let done: Int
    let total: Int

    var body: some View {
        // Dörderli gruplar: hangi dörtlüdeysen o grubun ilerlemesi.
        let inGroup = done % 4
        HStack(spacing: 2) {
            ForEach(0..<4, id: \.self) { index in
                Circle().fill(index < inGroup ? Theme.money : Theme.track).frame(width: 5, height: 5)
            }
        }
        .accessibilityHidden(true)
    }
}
