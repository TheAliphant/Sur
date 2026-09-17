#include <algorithm>
#include <array>
#include <cstdint>
#include <iostream>
#include <map>
#include <set>
#include <utility>
#include <vector>

using Cell = std::pair<int, int>;
using Shape = std::vector<Cell>;
using Tour = std::vector<int>;

static Cell transform(Cell p, int t) {
    int x = p.first, y = p.second;
    switch (t) {
        case 0: return { x,  y};
        case 1: return {-y,  x};
        case 2: return {-x, -y};
        case 3: return { y, -x};
        case 4: return {-x,  y};
        case 5: return {-y, -x};
        case 6: return { x, -y};
        default:return { y,  x};
    }
}

static Shape normalize(Shape s) {
    int minx = s[0].first, miny = s[0].second;
    for (auto [x, y] : s) {
        minx = std::min(minx, x);
        miny = std::min(miny, y);
    }
    for (auto &p : s) {
        p.first -= minx;
        p.second -= miny;
    }
    std::sort(s.begin(), s.end());
    return s;
}

static Shape canonical(const Shape &s) {
    Shape best;
    bool first = true;
    for (int t = 0; t < 8; ++t) {
        Shape q;
        q.reserve(s.size());
        for (Cell p : s) q.push_back(transform(p, t));
        q = normalize(std::move(q));
        if (first || q < best) {
            best = std::move(q);
            first = false;
        }
    }
    return best;
}

static Tour canonical_path(Tour p) {
    Tour r(p.rbegin(), p.rend());
    return std::min(p, r);
}

static Tour canonical_cycle(const Tour &c) {
    Tour best;
    bool first = true;
    const int n = static_cast<int>(c.size());
    for (int reverse = 0; reverse < 2; ++reverse) {
        for (int shift = 0; shift < n; ++shift) {
            Tour q;
            q.reserve(n);
            for (int i = 0; i < n; ++i) {
                int k = reverse ? (shift - i + n) % n : (shift + i) % n;
                q.push_back(c[k]);
            }
            if (first || q < best) {
                best = std::move(q);
                first = false;
            }
        }
    }
    return best;
}

static std::vector<std::vector<int>> automorphisms(const Shape &s) {
    std::map<Cell, int> index;
    for (int i = 0; i < static_cast<int>(s.size()); ++i) index[s[i]] = i;
    std::set<std::vector<int>> unique;
    for (int t = 0; t < 8; ++t) {
        Shape q;
        q.reserve(s.size());
        for (Cell p : s) q.push_back(transform(p, t));
        int minx = q[0].first, miny = q[0].second;
        for (auto [x, y] : q) {
            minx = std::min(minx, x);
            miny = std::min(miny, y);
        }
        std::vector<int> perm(s.size());
        bool ok = true;
        for (int i = 0; i < static_cast<int>(q.size()); ++i) {
            Cell z{q[i].first - minx, q[i].second - miny};
            auto it = index.find(z);
            if (it == index.end()) { ok = false; break; }
            perm[i] = it->second;
        }
        if (ok) unique.insert(std::move(perm));
    }
    return {unique.begin(), unique.end()};
}

static std::set<Tour> enumerate_paths(const std::vector<uint16_t> &adj) {
    const int n = static_cast<int>(adj.size());
    std::set<Tour> paths;
    Tour path(n);
    auto dfs = [&](auto &&self, int at, uint16_t used, int depth) -> void {
        path[depth - 1] = at;
        if (depth == n) {
            paths.insert(canonical_path(path));
            return;
        }
        uint16_t options = adj[at] & static_cast<uint16_t>(~used);
        while (options) {
            int next = __builtin_ctz(options);
            options &= options - 1;
            self(self, next, used | static_cast<uint16_t>(1u << next), depth + 1);
        }
    };
    for (int start = 0; start < n; ++start)
        dfs(dfs, start, static_cast<uint16_t>(1u << start), 1);
    return paths;
}

static std::set<Tour> enumerate_cycles(const std::vector<uint16_t> &adj) {
    const int n = static_cast<int>(adj.size());
    std::set<Tour> cycles;
    Tour path(n);
    path[0] = 0;
    auto dfs = [&](auto &&self, int at, uint16_t used, int depth) -> void {
        if (depth == n) {
            if (adj[at] & 1u) cycles.insert(canonical_cycle(path));
            return;
        }
        uint16_t options = adj[at] & static_cast<uint16_t>(~used);
        while (options) {
            int next = __builtin_ctz(options);
            options &= options - 1;
            path[depth] = next;
            self(self, next, used | static_cast<uint16_t>(1u << next), depth + 1);
        }
    };
    dfs(dfs, 0, 1u, 1);
    return cycles;
}

struct Counts {
    long long t_open = 0, t_closed = 0;
    long long s_open = 0, s_closed = 0;
    long long r_open = 0, r_closed = 0;
};

static std::set<Tour> mapped_orbit(const Tour &tour,
                                   const std::vector<std::vector<int>> &autos,
                                   bool cycle) {
    std::set<Tour> orbit;
    for (const auto &perm : autos) {
        Tour q;
        q.reserve(tour.size());
        for (int v : tour) q.push_back(perm[v]);
        orbit.insert(cycle ? canonical_cycle(q) : canonical_path(q));
    }
    return orbit;
}

static Counts count_board(const Shape &s) {
    const int n = static_cast<int>(s.size());
    std::map<Cell, int> index;
    for (int i = 0; i < n; ++i) index[s[i]] = i;
    std::vector<uint16_t> adj(n, 0);
    const std::array<Cell, 8> jumps{{
        {1,2},{2,1},{-1,2},{-2,1},{1,-2},{2,-1},{-1,-2},{-2,-1}
    }};
    for (int i = 0; i < n; ++i) {
        for (auto [dx, dy] : jumps) {
            auto it = index.find({s[i].first + dx, s[i].second + dy});
            if (it != index.end()) adj[i] |= static_cast<uint16_t>(1u << it->second);
        }
    }

    auto paths = enumerate_paths(adj);
    auto cycles = enumerate_cycles(adj);
    auto autos = automorphisms(s);
    Counts c;
    c.r_open = static_cast<long long>(paths.size());
    c.r_closed = static_cast<long long>(cycles.size());

    std::set<Tour> seen;
    for (const Tour &p : paths) {
        if (seen.count(p)) continue;
        auto orbit = mapped_orbit(p, autos, false);
        seen.insert(orbit.begin(), orbit.end());
        ++c.t_open;
        if (orbit.size() < autos.size()) ++c.s_open;
    }
    seen.clear();
    for (const Tour &p : cycles) {
        if (seen.count(p)) continue;
        auto orbit = mapped_orbit(p, autos, true);
        seen.insert(orbit.begin(), orbit.end());
        ++c.t_closed;
        if (orbit.size() < autos.size()) ++c.s_closed;
    }
    return c;
}

static void print_sequence(const char *name, const std::vector<long long> &v) {
    std::cout << name << " = ";
    for (size_t i = 0; i < v.size(); ++i) {
        if (i) std::cout << ", ";
        std::cout << v[i];
    }
    std::cout << '\n';
}

int main() {
    constexpr int max_n = 12;
    std::set<Shape> shapes;
    shapes.insert(Shape{{0, 0}});
    std::vector<Counts> totals(max_n + 1);
    const std::array<Cell, 4> sides{{{1,0},{-1,0},{0,1},{0,-1}}};

    for (int n = 1; n <= max_n; ++n) {
        if (n >= 7) {
            for (const Shape &s : shapes) {
                Counts c = count_board(s);
                totals[n].t_open += c.t_open;
                totals[n].t_closed += c.t_closed;
                totals[n].s_open += c.s_open;
                totals[n].s_closed += c.s_closed;
                totals[n].r_open += c.r_open;
                totals[n].r_closed += c.r_closed;
            }
        }
        if (n == max_n) break;
        std::set<Shape> next;
        for (const Shape &s : shapes) {
            std::set<Cell> occupied(s.begin(), s.end());
            for (auto [x, y] : s) {
                for (auto [dx, dy] : sides) {
                    Cell z{x + dx, y + dy};
                    if (occupied.count(z)) continue;
                    Shape grown = s;
                    grown.push_back(z);
                    next.insert(canonical(grown));
                }
            }
        }
        shapes = std::move(next);
    }

    std::vector<long long> t_open, t_closed, s_open, s_closed, r_open, r_closed;
    for (int n = 7; n <= max_n; ++n) {
        t_open.push_back(totals[n].t_open);
        t_closed.push_back(totals[n].t_closed);
        s_open.push_back(totals[n].s_open);
        s_closed.push_back(totals[n].s_closed);
        r_open.push_back(totals[n].r_open);
        r_closed.push_back(totals[n].r_closed);
    }
    print_sequence("T_open(7..12)", t_open);
    print_sequence("T_closed(7..12)", t_closed);
    print_sequence("S_open(7..12)", s_open);
    print_sequence("S_closed(7..12)", s_closed);
    print_sequence("R_open(7..12)", r_open);
    print_sequence("R_closed(7..12)", r_closed);
    std::cout << "verdict=reproduces minimum if every sequence matches the claim\n";
}
