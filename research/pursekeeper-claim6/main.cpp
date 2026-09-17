#include <algorithm>
#include <array>
#include <cstdint>
#include <iostream>
#include <map>
#include <set>
#include <unordered_set>
#include <utility>
#include <vector>

using Cell = std::pair<int,int>;
using Shape = std::vector<Cell>;

static Cell tf(Cell p, int t) {
    int x=p.first, y=p.second;
    switch(t) {
        case 0:return {x,y}; case 1:return {-y,x}; case 2:return {-x,-y}; case 3:return {y,-x};
        case 4:return {-x,y}; case 5:return {-y,-x}; case 6:return {x,-y}; default:return {y,x};
    }
}

static Shape norm(Shape s) {
    int ax=s[0].first, ay=s[0].second;
    for(auto [x,y]:s){ ax=std::min(ax,x); ay=std::min(ay,y); }
    for(auto &p:s){ p.first-=ax; p.second-=ay; }
    std::sort(s.begin(),s.end());
    return s;
}

static Shape canon(const Shape &s) {
    Shape best; bool first=true;
    for(int t=0;t<8;++t){
        Shape q; q.reserve(s.size());
        for(Cell p:s) q.push_back(tf(p,t));
        q=norm(std::move(q));
        if(first||q<best){best=std::move(q);first=false;}
    }
    return best;
}

struct Graph {
    int n;
    std::vector<uint16_t> a;
    std::vector<int> degree;
    int black=0, white=0;
};

static Graph knight_graph(const Shape &s) {
    std::map<Cell,int> idx;
    for(int i=0;i<(int)s.size();++i) idx[s[i]]=i;
    const std::array<Cell,8> jump{{{1,2},{2,1},{-1,2},{-2,1},{1,-2},{2,-1},{-1,-2},{-2,-1}}};
    Graph g{(int)s.size(),std::vector<uint16_t>(s.size()),std::vector<int>(s.size())};
    for(int i=0;i<g.n;++i){
        ((s[i].first+s[i].second)&1 ? g.black : g.white)++;
        for(auto [dx,dy]:jump){
            auto it=idx.find({s[i].first+dx,s[i].second+dy});
            if(it!=idx.end()) g.a[i]|=(uint16_t)(1u<<it->second);
        }
        g.degree[i]=__builtin_popcount(g.a[i]);
    }
    return g;
}

static bool connected(const Graph &g) {
    if(g.n==1) return true;
    uint16_t seen=1, frontier=1;
    while(frontier){
        uint16_t next=0, f=frontier;
        while(f){int v=__builtin_ctz(f);f&=f-1;next|=g.a[v];}
        next&=(uint16_t)~seen;
        seen|=next; frontier=next;
    }
    return __builtin_popcount(seen)==g.n;
}

static std::vector<int> ordered_options(const Graph &g, int at, uint16_t used) {
    uint16_t bits=g.a[at]&(uint16_t)~used;
    std::vector<int> out;
    while(bits){int v=__builtin_ctz(bits);bits&=bits-1;out.push_back(v);}
    std::sort(out.begin(),out.end(),[&](int x,int y){
        int dx=__builtin_popcount(g.a[x]&(uint16_t)~used);
        int dy=__builtin_popcount(g.a[y]&(uint16_t)~used);
        return dx<dy;
    });
    return out;
}

static bool has_path(const Graph &g) {
    if(g.n==1) return true;
    if(std::abs(g.black-g.white)>1) return false;
    std::vector<int> leaves;
    for(int v=0;v<g.n;++v){
        if(g.degree[v]==0) return false;
        if(g.degree[v]==1) leaves.push_back(v);
    }
    if(leaves.size()>2) return false;
    std::vector<int> starts;
    if(!leaves.empty()) starts.push_back(leaves[0]);
    else for(int v=0;v<g.n;++v) starts.push_back(v);
    const uint16_t full=(uint16_t)((1u<<g.n)-1);
    for(int start:starts){
        std::unordered_set<uint32_t> bad;
        auto dfs=[&](auto &&self,int at,uint16_t used)->bool{
            if(used==full) return true;
            uint32_t key=((uint32_t)used<<4)|at;
            if(bad.count(key)) return false;
            for(int v:ordered_options(g,at,used))
                if(self(self,v,used|(uint16_t)(1u<<v))) return true;
            bad.insert(key); return false;
        };
        if(dfs(dfs,start,(uint16_t)(1u<<start))) return true;
    }
    return false;
}

static bool has_cycle(const Graph &g) {
    if(g.n<4 || g.black!=g.white) return false;
    for(int d:g.degree) if(d<2) return false;
    const int start=0;
    const uint16_t full=(uint16_t)((1u<<g.n)-1);
    std::unordered_set<uint32_t> bad;
    auto dfs=[&](auto &&self,int at,uint16_t used)->bool{
        if(used==full) return (g.a[at]&(1u<<start))!=0;
        uint32_t key=((uint32_t)used<<4)|at;
        if(bad.count(key)) return false;
        for(int v:ordered_options(g,at,used))
            if(self(self,v,used|(uint16_t)(1u<<v))) return true;
        bad.insert(key); return false;
    };
    return dfs(dfs,start,(uint16_t)(1u<<start));
}

static void print(const char *name,const std::vector<long long>&v){
    std::cout<<name<<" = ";
    for(size_t i=0;i<v.size();++i){if(i)std::cout<<", ";std::cout<<v[i];}
    std::cout<<'\n';
}

int main(){
    constexpr int max_n=14;
    std::set<Shape> shapes; shapes.insert(Shape{{0,0}});
    std::vector<long long> k(max_n+1),o(max_n+1),c(max_n+1),free_count(max_n+1);
    const std::array<Cell,4> side{{{1,0},{-1,0},{0,1},{0,-1}}};
    for(int n=1;n<=max_n;++n){
        free_count[n]=shapes.size();
        for(const Shape&s:shapes){
            Graph g=knight_graph(s);
            if(!connected(g)) continue;
            ++k[n];
            if(has_path(g)) ++o[n];
            if(has_cycle(g)) ++c[n];
        }
        if(n==max_n) break;
        std::set<Shape> next;
        for(const Shape&s:shapes){
            std::set<Cell> occ(s.begin(),s.end());
            for(auto [x,y]:s) for(auto [dx,dy]:side){
                Cell z{x+dx,y+dy}; if(occ.count(z)) continue;
                Shape q=s; q.push_back(z); next.insert(canon(q));
            }
        }
        shapes=std::move(next);
    }
    std::vector<long long> fk,kk,oo,cc;
    for(int n=1;n<=max_n;++n){fk.push_back(free_count[n]);kk.push_back(k[n]);oo.push_back(o[n]);cc.push_back(c[n]);}
    print("free_polyominoes(1..14)",fk);
    print("K(1..14)",kk); print("O(1..14)",oo); print("C(1..14)",cc);
    std::cout<<"verdict=reproduces minimum if every sequence matches the claim\n";
}
