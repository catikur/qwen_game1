import SwiftUI
import UIKit
import CapitalForgeLiteKit

/// Bölüm rozeti: Bronz, Gümüş, Altın, Elmas.
struct DivisionBadge: View {
    let division: Int
    var size: CGFloat = 38

    static func colors(_ division: Int) -> (Color, Color) {
        switch division {
        case 1: (Color(hex: 0xE3E9F2), Color(hex: 0x9AA8BD))
        case 2: (Color(hex: 0xFFE08A), Color(hex: 0xFFB938))
        case 3: (Color(hex: 0xA6E9FF), Color(hex: 0x4FB8F0))
        default: (Color(hex: 0xF0B585), Color(hex: 0xC27A45))
        }
    }

    static func name(_ division: Int) -> String {
        let key = LiteLeague.divisionKeys[max(0, min(LiteLeague.divisions - 1, division))]
        return L10n.t("league.division.\(key)")
    }

    var body: some View {
        IconTile(symbol: division >= 3 ? "diamond.fill" : "trophy.fill", colors: DivisionBadge.colors(division), size: size)
            .accessibilityLabel(DivisionBadge.name(division))
    }
}

/// Kartlarda haftalık lig özeti.
struct LeagueCard: View {
    @Environment(GameStore.self) private var store
    @Binding var show: Bool

    var body: some View {
        let league = store.league
        let division = league.standings?.division ?? 0
        HStack(spacing: 11) {
            DivisionBadge(division: division, size: 38)
            VStack(alignment: .leading, spacing: 2) {
                Text(L10n.t("league.title") + (league.status == .ready ? " · " + DivisionBadge.name(division) : ""))
                    .font(Theme.display(16))
                    .foregroundStyle(Theme.ink)
                Text(LeagueCard.subtitle(league))
                    .font(Theme.text(11.5))
                    .foregroundStyle(Theme.muted)
                    .lineLimit(2)
            }
            Spacer(minLength: 6)
            Button {
                show = true
            } label: {
                Text(league.status == .signedOut ? L10n.t("league.join") : L10n.t("league.open"))
                    .font(Theme.display(13.5))
                    .padding(.horizontal, 12)
                    .frame(minHeight: 38)
            }
            .buttonStyle(.glossy(Theme.blue, radius: 14))
            .accessibilityIdentifier("league")
        }
        .glassCard()
    }

    static func subtitle(_ league: LeagueService) -> String {
        if let standings = league.standings, let mine = standings.group.first(where: \.me) {
            let left = max(0, standings.endsAt / 1000 - Date().timeIntervalSince1970)
            return L10n.t("league.rank", mine.rank, standings.group.count) + " · " + L10n.t("league.ends", Format.duration(left))
        }
        return L10n.t("league.score", Format.money(league.tracker.score))
    }
}

enum LeagueTab: Hashable {
    case group, privateLeagues
}

/// Haftalık lig penceresi: bölüm, 30 kişilik grup, özel ligler, ad.
struct LeagueSheet: View {
    @Environment(GameStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State private var tab: LeagueTab = ProcessInfo.processInfo.arguments.contains("-liteLeaguePrivate") ? .privateLeagues : .group
    @State private var name = ""
    @State private var newLeague = ""
    @State private var code = ""
    @State private var renaming = false
    @State private var newName = ""
    @State private var confirmDelete = false

    var body: some View {
        let league = store.league
        VStack(spacing: 0) {
            HStack {
                Text(L10n.t("league.title")).font(Theme.display(22)).foregroundStyle(Theme.ink)
                Spacer()
                Button {
                    dismiss()
                } label: {
                    Text(L10n.t("settings.done"))
                        .font(Theme.display(14))
                        .padding(.horizontal, 14)
                        .frame(minHeight: 34)
                }
                .buttonStyle(.glossy(Theme.blue, radius: 12, edge: 3))
                .accessibilityIdentifier("league-done")
            }
            .padding(.horizontal, 16)
            .padding(.top, 18)
            .padding(.bottom, 10)

            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    summary(league)
                    if let problem = league.problem {
                        Label(L10n.t(problem), systemImage: "exclamationmark.triangle.fill")
                            .font(Theme.text(12, .heavy))
                            .foregroundStyle(Theme.warn)
                            .padding(.horizontal, 4)
                    }
                    switch league.status {
                    case .unconfigured:
                        Text(L10n.t("league.soon"))
                            .font(Theme.text(13))
                            .foregroundStyle(Theme.muted)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .glassCard()
                    case .signedOut:
                        joinCard(league)
                    case .ready:
                        PillPicker(selection: $tab, options: [LeagueTab.group, LeagueTab.privateLeagues]) { option in
                            option == .group ? L10n.t("league.tabGroup") : L10n.t("league.tabPrivate")
                        }
                        if tab == .group {
                            group(league)
                        } else {
                            privateLeagues(league)
                        }
                        account(league)
                    }
                    if GameCenter.available {
                        Button {
                            GameCenter.showLeaderboards()
                        } label: {
                            Label(L10n.t("league.gameCenter"), systemImage: "gamecontroller.fill")
                                .font(Theme.display(14))
                                .frame(maxWidth: .infinity, minHeight: 42)
                        }
                        .buttonStyle(.glossy(Theme.green, radius: 15))
                    }
                }
                .padding(.horizontal, 14)
                .padding(.bottom, 20)
            }
            .scrollIndicators(.hidden)
        }
        .task { await league.refresh() }
        .alert(L10n.t("league.renameTitle"), isPresented: $renaming) {
            TextField(L10n.t("league.namePlaceholder"), text: $newName)
                .autocorrectionDisabled()
            Button(L10n.t("league.save")) {
                Task { await league.rename(newName) }
            }
            Button(L10n.t("common.cancel"), role: .cancel) {}
        } message: {
            Text(L10n.t("league.nameHint"))
        }
        .confirmationDialog(L10n.t("league.deleteTitle"), isPresented: $confirmDelete, titleVisibility: .visible) {
            Button(L10n.t("league.deleteConfirm"), role: .destructive) {
                Task { await league.deleteAccount() }
            }
            Button(L10n.t("common.cancel"), role: .cancel) {}
        } message: {
            Text(L10n.t("league.deleteBody"))
        }
    }

    // MARK: - Bölümler

    private func summary(_ league: LeagueService) -> some View {
        let division = league.standings?.division ?? 0
        let left = league.standings.map { max(0, $0.endsAt / 1000 - Date().timeIntervalSince1970) }
        return VStack(alignment: .leading, spacing: 9) {
            HStack(spacing: 12) {
                DivisionBadge(division: division, size: 46)
                VStack(alignment: .leading, spacing: 2) {
                    Text(L10n.t("league.divisionLine", DivisionBadge.name(division)))
                        .font(Theme.display(19))
                        .foregroundStyle(Theme.ink)
                    Text(L10n.t("league.score", Format.money(league.tracker.score)))
                        .font(Theme.text(13, .heavy))
                        .foregroundStyle(Theme.money)
                }
                Spacer()
                if let left {
                    Pill(text: L10n.t("league.ends", Format.duration(left)), symbol: "clock.fill")
                }
            }
            Text(L10n.t("league.body", LiteLeague.promote, LiteLeague.demote))
                .font(Theme.text(12))
                .foregroundStyle(Theme.muted)
        }
        .glassCard()
    }

    private func joinCard(_ league: LeagueService) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            field(L10n.t("league.namePlaceholder"), text: $name)
            Text(L10n.t("league.nameHint"))
                .font(Theme.text(11.5))
                .foregroundStyle(Theme.muted)
            Button {
                Task { await league.register(name: name) }
            } label: {
                Text(L10n.t("league.join"))
                    .font(Theme.display(15))
                    .frame(maxWidth: .infinity, minHeight: 44)
            }
            .buttonStyle(.glossy(name.count >= 3 && !league.busy ? Theme.green : nil, radius: 15))
            .disabled(name.count < 3 || league.busy)
        }
        .glassCard()
    }

    private func group(_ league: LeagueService) -> some View {
        VStack(spacing: 5) {
            if let rows = league.standings?.group, !rows.isEmpty {
                ForEach(rows) { row in
                    LeagueRowView(row: row)
                }
            } else {
                Text(L10n.t("league.empty"))
                    .font(Theme.text(12.5))
                    .foregroundStyle(Theme.muted)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .glassCard(padding: 8)
    }

    private func privateLeagues(_ league: LeagueService) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            if league.leagues.isEmpty {
                Text(L10n.t("league.noPrivate") + " " + L10n.t("league.privateBody"))
                    .font(Theme.text(12.5))
                    .foregroundStyle(Theme.muted)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .glassCard()
            }
            ForEach(league.leagues) { item in
                VStack(alignment: .leading, spacing: 6) {
                    HStack(spacing: 8) {
                        Text(item.name).font(Theme.display(17)).foregroundStyle(Theme.ink)
                        Spacer()
                        Button {
                            UIPasteboard.general.string = item.code
                        } label: {
                            Label(L10n.t("league.code", item.code), systemImage: "doc.on.doc.fill")
                                .font(Theme.text(11.5, .heavy))
                                .padding(.horizontal, 10)
                                .frame(minHeight: 28)
                        }
                        .buttonStyle(.glossy(Theme.gold, radius: 10, edge: 2, foreground: Color(hex: 0x5A3A00)))
                        .accessibilityLabel(L10n.t("league.copy"))
                    }
                    ForEach(item.members) { row in
                        LeagueRowView(row: row)
                    }
                    Button(L10n.t("league.leave")) {
                        Task { await league.leaveLeague(code: item.code) }
                    }
                    .font(Theme.text(12, .heavy))
                    .foregroundStyle(Theme.bad)
                    .padding(.top, 2)
                }
                .glassCard(padding: 10)
            }
            HStack(spacing: 8) {
                field(L10n.t("league.createPlaceholder"), text: $newLeague)
                Button {
                    Task {
                        await league.createLeague(name: newLeague)
                        if league.problem == nil { newLeague = "" }
                    }
                } label: {
                    Text(L10n.t("league.create")).font(Theme.display(13.5)).padding(.horizontal, 12).frame(minHeight: 40)
                }
                .buttonStyle(.glossy(newLeague.count >= 3 ? Theme.orange : nil, radius: 13))
                .disabled(newLeague.count < 3 || league.busy)
            }
            .glassCard(padding: 10)
            HStack(spacing: 8) {
                field(L10n.t("league.codePlaceholder"), text: $code)
                    .textInputAutocapitalization(.characters)
                Button {
                    Task {
                        await league.joinLeague(code: code)
                        if league.problem == nil { code = "" }
                    }
                } label: {
                    Text(L10n.t("league.joinCode")).font(Theme.display(13.5)).padding(.horizontal, 12).frame(minHeight: 40)
                }
                .buttonStyle(.glossy(code.count == 6 ? Theme.blue : nil, radius: 13))
                .disabled(code.count != 6 || league.busy)
            }
            .glassCard(padding: 10)
        }
    }

    /// Hesap satırı: ad, adı değiştir, hesabı sil.
    private func account(_ league: LeagueService) -> some View {
        HStack(spacing: 8) {
            Image(systemName: "person.crop.circle.fill")
                .font(.system(size: 20))
                .foregroundStyle(Theme.muted)
            Text(league.account?.name ?? "")
                .font(Theme.text(14, .heavy))
                .foregroundStyle(Theme.ink)
                .lineLimit(1)
            Spacer(minLength: 4)
            Button(L10n.t("league.rename")) {
                newName = league.account?.name ?? ""
                renaming = true
            }
            .font(Theme.text(12, .heavy))
            .foregroundStyle(Theme.ink)
            .disabled(league.busy)
            Button(L10n.t("league.delete")) {
                confirmDelete = true
            }
            .font(Theme.text(12, .heavy))
            .foregroundStyle(Theme.bad)
            .disabled(league.busy)
            .accessibilityIdentifier("league-delete")
        }
        .glassCard(padding: 10)
    }

    private func field(_ placeholder: String, text: Binding<String>) -> some View {
        TextField(placeholder, text: text)
            .font(Theme.text(15, .heavy))
            .foregroundStyle(Theme.ink)
            .autocorrectionDisabled()
            .padding(.horizontal, 12)
            .frame(minHeight: 42)
            .background(Theme.tile, in: RoundedRectangle(cornerRadius: 13, style: .continuous))
    }
}

/// Sıralama satırı: sıra, ad, puan; çıkış/iniş bölgesi şeritle, sen vurgulu.
struct LeagueRowView: View {
    let row: LeagueRow

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: 12, style: .continuous)
        HStack(spacing: 10) {
            Text("\(row.rank)")
                .font(Theme.display(13))
                .foregroundStyle(row.rank <= 3 ? Color(hex: 0x5A3A00) : Theme.muted)
                .frame(width: 26, height: 26)
                .background(row.rank <= 3 ? AnyShapeStyle(Color(hex: 0xFFD25E)) : AnyShapeStyle(Theme.track), in: Circle())
            Text(row.me ? row.name + " · " + L10n.t("league.you") : row.name)
                .font(row.me ? Theme.display(14) : Theme.text(13.5, .heavy))
                .foregroundStyle(Theme.ink)
                .lineLimit(1)
            Spacer(minLength: 6)
            if let move = row.move, move != 0 {
                Image(systemName: move > 0 ? "arrow.up.circle.fill" : "arrow.down.circle.fill")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(move > 0 ? Theme.good : Theme.bad)
                    .accessibilityLabel(L10n.t(move > 0 ? "league.up" : "league.down"))
            }
            Text(Format.money(row.score))
                .font(Theme.display(13.5))
                .foregroundStyle(Theme.money)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 5)
        .background(row.me ? Theme.neck : Color.clear, in: shape)
        .overlay(shape.strokeBorder(row.me ? Theme.neckRing : .clear, lineWidth: 1.5))
    }
}
