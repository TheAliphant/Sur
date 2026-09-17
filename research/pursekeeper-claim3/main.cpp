#include <algorithm>
#include <array>
#include <cstdint>
#include <iostream>
#include <string>
#include <unordered_set>
#include <utility>
#include <vector>

using Cell = std::pair<int,int>;

static Cell tf(Cell p,int t){
    int x=p.first,y=p.second;
    switch(t){
        case 0:return{x,y}; case 1:return{-y,x}; case 2:return{-x,-y}; case 3:return{y,-x};
        case 4:return{-x,y}; case 5:return{-y,-x}; case 6:return{x,-y}; default:return{y,x};
    }
}

static std::string shape_key(const std::vector<Cell>&walk){
    std::string best; bool first=true;
    for(int t=0;t<8;++t){
        std::array<uint16_t,18> packed{};
        int minx=100,miny=100;
        std::array<Cell,18> q{};
        for(size_t i=0;i<walk.size();++i){
            q[i]=tf(walk[i],t); minx=std::min(minx,q[i].first); miny=std::min(miny,q[i].second);
        }
        for(size_t i=0;i<walk.size();++i)
            packed[i]=(uint16_t)(((q[i].first-minx)<<6)|(q[i].second-miny));
        std::sort(packed.begin(),packed.begin()+walk.size());
        std::string key; key.resize(walk.size()*2);
        for(size_t i=0;i<walk.size();++i){
            key[2*i]=(char)(packed[i]>>8); key[2*i+1]=(char)(packed[i]&255);
        }
        if(first||key<best){best=std::move(key);first=false;}
    }
    return best;
}

static uint16_t slot(int x,int y){return (uint16_t)(((x+32)<<6)|(y+32));}

int main(){
    constexpr int max_n=18;
    std::vector<std::unordered_set<std::string>> shapes(max_n+1);
    std::array<unsigned char,4096> used{};
    std::vector<Cell> walk;
    walk.reserve(max_n);
    walk.push_back({0,0}); used[slot(0,0)]=1;
    shapes[1].insert(shape_key(walk));
    walk.push_back({1,0}); used[slot(1,0)]=1;
    const std::array<Cell,4> step{{{1,0},{-1,0},{0,1},{0,-1}}};
    auto dfs=[&](auto&&self,int x,int y)->void{
        int n=(int)walk.size();
        shapes[n].insert(shape_key(walk));
        if(n==max_n)return;
        for(auto [dx,dy]:step){
            int nx=x+dx,ny=y+dy; uint16_t s=slot(nx,ny);
            if(used[s])continue;
            used[s]=1; walk.push_back({nx,ny}); self(self,nx,ny); walk.pop_back(); used[s]=0;
        }
    };
    dfs(dfs,1,0);
    std::cout<<"a(1..18) = ";
    for(int n=1;n<=max_n;++n){if(n>1)std::cout<<", ";std::cout<<shapes[n].size();}
    std::cout<<"\nverdict=reproduces full range if every term matches the claim\n";
}
