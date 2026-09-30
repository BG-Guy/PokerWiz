// Solves a spot with postflop-solver and dumps, at each requested node, every hand's strategy and the EV of
// each action, plus both players' ranges there.
// Usage: solver-benchmark <spec.json>   (writes JSON to stdout; DRY=1 only prints the memory needed)
// spec: { mode?: "turn" | "river", flop, turn, river, oop_range, ip_range, pot, stack,
//         flop_sizes, flop_raise, turn_sizes, turn_raise, river_sizes, river_raise, raise, iterations,
//         nodes: [{ name, path: ["check" | "call" | "fold" | "bet:<fraction of pot>" | "deal"] }] }
// Amounts are in tenths of a dollar ($1/$2 blinds: a 110 pot is $11).
use postflop_solver::*;
use serde_json::{json, Value};

fn action_label(a: &Action) -> (String, i32) {
    match a {
        Action::Fold => ("fold".into(), 0),
        Action::Check => ("check".into(), 0),
        Action::Call => ("call".into(), 0),
        Action::Bet(x) => ("bet".into(), *x),
        Action::Raise(x) => ("raise".into(), *x),
        Action::AllIn(x) => ("allin".into(), *x),
        _ => ("chance".into(), 0),
    }
}

fn main() {
    let path = std::env::args().nth(1).expect("spec path");
    let spec: Value = serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap();
    let s = |k: &str| spec[k].as_str().unwrap().to_string();
    let pot = spec["pot"].as_i64().unwrap() as i32;
    let stack = spec["stack"].as_i64().unwrap() as i32;
    let turn_card = spec["turn"].as_str().map(|t| card_from_str(t).unwrap());
    let river_card = spec["river"].as_str().map(|t| card_from_str(t).unwrap());

    // mode "river": solve only the river, from the given (exact, per-combo) ranges and pot.
    let river_mode = spec["mode"].as_str() == Some("river");
    let turn_mode = spec["mode"].as_str() == Some("turn");
    let card_config = CardConfig {
        range: [s("oop_range").parse().unwrap(), s("ip_range").parse().unwrap()],
        flop: flop_from_str(&s("flop")).unwrap(),
        turn: if river_mode || turn_mode { turn_card.unwrap() } else { NOT_DEALT },
        river: if river_mode { river_card.unwrap() } else { NOT_DEALT },
    };
    let sizes = |k: &str| {
        let raise_key = format!("{}_raise", k.trim_end_matches("_sizes"));
        let raise = spec[raise_key.as_str()].as_str().or(spec["raise"].as_str()).unwrap();
        BetSizeOptions::try_from((spec[k].as_str().unwrap(), raise)).unwrap()
    };
    let tree_config = TreeConfig {
        initial_state: if river_mode { BoardState::River } else if turn_mode { BoardState::Turn } else { BoardState::Flop },
        starting_pot: pot,
        effective_stack: stack,
        rake_rate: 0.0,
        rake_cap: 0.0,
        flop_bet_sizes: [sizes("flop_sizes"), sizes("flop_sizes")],
        turn_bet_sizes: [sizes("turn_sizes"), sizes("turn_sizes")],
        river_bet_sizes: [sizes("river_sizes"), sizes("river_sizes")],
        turn_donk_sizes: None,
        river_donk_sizes: None,
        add_allin_threshold: 1.5,
        force_allin_threshold: 0.15,
        merging_threshold: 0.1,
    };
    let tree = ActionTree::new(tree_config).unwrap();
    let mut game = PostFlopGame::with_config(card_config, tree).unwrap();
    let (mem, mem_c) = game.memory_usage();
    let compress = mem > 9 * (1u64 << 30);
    if std::env::var("DRY").is_ok() || mem_c > 11 * (1u64 << 30) {
        eprintln!("memory {:.2}GB (compressed {:.2}GB): not solving", mem as f64 / 1e9, mem_c as f64 / 1e9);
        return;
    }
    eprintln!("memory {:.2}GB (compressed {:.2}GB), compress={}", mem as f64 / 1e9, mem_c as f64 / 1e9, compress);
    game.allocate_memory(compress);
    let iters = spec["iterations"].as_u64().unwrap_or(300) as u32;
    let expl = solve(&mut game, iters, pot as f32 * 0.003, false);
    eprintln!("exploitability {:.3} ({:.2}% pot)", expl, 100.0 * expl / pot as f32);

    let mut out_nodes = vec![];
    for node in spec["nodes"].as_array().unwrap() {
        game.back_to_root();
        let mut ok = true;
        let mut line: Vec<Value> = vec![];
        for step in node["path"].as_array().unwrap() {
            let step = step.as_str().unwrap();
            if game.is_chance_node() || step == "deal" {
                let card = if game.current_board().len() == 3 { turn_card } else { river_card };
                game.play(card.unwrap() as usize);
                line.push(json!({ "deal": card_to_string(card.unwrap()).unwrap() }));
                continue;
            }
            let actions = game.available_actions();
            let idx = if let Some(frac) = step.strip_prefix("bet:") {
                // closest bet/raise/allin by amount added relative to pot
                let f: f64 = frac.parse().unwrap();
                let [a, b] = game.total_bet_amount();
                let base = game_pot(&game, pot) as f64;
                let facing = (a.max(b)) as f64;
                actions.iter().enumerate()
                    .filter(|(_, x)| matches!(x, Action::Bet(_) | Action::Raise(_) | Action::AllIn(_)))
                    .min_by(|(_, x), (_, y)| {
                        let d = |z: &Action| { let (_, amt) = action_label(z); ((amt as f64 - facing) / base - f).abs() };
                        d(x).partial_cmp(&d(y)).unwrap()
                    })
                    .map(|(i, _)| i)
            } else {
                actions.iter().position(|x| action_label(x).0 == step)
            };
            match idx {
                Some(i) => {
                    let (k, amt) = action_label(&actions[i]);
                    line.push(json!({ "player": game.current_player(), "kind": k, "amount": amt }));
                    game.play(i)
                }
                None => { ok = false; break; }
            }
        }
        if !ok || game.is_terminal_node() || game.is_chance_node() {
            out_nodes.push(json!({ "name": node["name"], "error": "path not available" }));
            continue;
        }
        game.cache_normalized_weights();
        let player = game.current_player();
        let actions: Vec<Value> = game.available_actions().iter().map(|a| { let (k, amt) = action_label(a); json!({ "kind": k, "amount": amt }) }).collect();
        let cards = holes_to_strings(game.private_cards(player)).unwrap();
        let n = cards.len();
        let strat = game.strategy();
        let evd = game.expected_values_detail(player);
        let weights = game.normalized_weights(player);
        let hands: Vec<Value> = (0..n).map(|h| json!({
            "cards": cards[h],
            "weight": weights[h],
            "strategy": (0..actions.len()).map(|a| strat[a * n + h]).collect::<Vec<f32>>(),
            "ev": (0..actions.len()).map(|a| evd[a * n + h]).collect::<Vec<f32>>(),
        })).collect();
        let ranges: Vec<Value> = (0..2).map(|p| {
            let c = holes_to_strings(game.private_cards(p)).unwrap();
            let w = game.weights(p);
            json!(c.iter().zip(w.iter()).filter(|(_, w)| **w > 1e-4).map(|(c, w)| format!("{}:{:.4}", c, w)).collect::<Vec<_>>().join(","))
        }).collect();
        out_nodes.push(json!({
            "name": node["name"], "player": player, "ranges": ranges, "board": holes_board(&game.current_board()),
            "pot": game_pot(&game, pot), "bets": game.total_bet_amount(), "line": line, "actions": actions, "hands": hands
        }));
    }
    println!("{}", json!({ "exploitability_pct": 100.0 * expl / pot as f32, "nodes": out_nodes }));
}

// Pot at the current node, including this street's bets.
fn game_pot(game: &PostFlopGame, starting: i32) -> i32 {
    let [a, b] = game.total_bet_amount();
    starting + a + b
}

fn holes_board(cards: &[u8]) -> String {
    cards.iter().map(|c| card_to_string(*c).unwrap()).collect::<Vec<_>>().join("")
}
