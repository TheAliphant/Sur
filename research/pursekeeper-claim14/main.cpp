#include <algorithm>
#include <array>
#include <cstdint>
#include <iostream>
#include <map>
#include <set>
#include <unordered_set>
#include <vector>
using P=std::array<int,3>; using Shape=std::vector<P>;
static const std::array<std::array<int,3>,6> perms{{{{0,1,2}},{{0,2,1}},{{1,0,2}},{{1,2,0}},{{2,0,1}},{{2,1,0}}}};
static Shape norm(Shape s){P a{0,0,0};bool ok=false;for(auto&p:s)if(p[0]+p[1]+p[2]==0&&(!ok||p<a)){a=p;ok=true;}if(!ok)return{};for(auto&p:s)for(int k=0;k<3;++k)p[k]-=a[k];std::sort(s.begin(),s.end());return s;}
static Shape canon(const Shape&s){Shape best;bool first=true;for(auto pm:perms)for(int inv=0;inv<2;++inv){Shape q;for(P p:s){P z{p[pm[0]],p[pm[1]],p[pm[2]]};if(inv)z=P{1-z[0],-z[1],-z[2]};q.push_back(z);}q=norm(q);if(!q.empty()&&(first||q<best)){best=q;first=false;}}return best;}
static std::vector<P> nbr(P p){std::vector<P>v;int s=p[0]+p[1]+p[2];for(int k=0;k<3;++k){P q=p;q[k]+=s==0?1:-1;v.push_back(q);}return v;}
struct G{int n;std::vector<uint64_t>a;};
static G graph(const Shape&s){std::map<P,int>ix;for(int i=0;i<(int)s.size();++i)ix[s[i]]=i;G g{(int)s.size(),std::vector<uint64_t>(s.size())};for(int i=0;i<g.n;++i)for(P q:nbr(s[i])){auto it=ix.find(q);if(it!=ix.end())g.a[i]|=1ull<<it->second;}return g;}
static int cycles(const G&g,int stop=1000000){if(g.n<6)return 0;for(auto a:g.a)if(__builtin_popcountll(a)<2)return 0;const int st=0;uint64_t full=g.n==64?~0ull:((1ull<<g.n)-1),count=0;auto dfs=[&](auto&&self,int v,uint64_t used)->void{if(count>=2*stop)return;if(used==full){if((g.a[v]>>st)&1ull)++count;return;}uint64_t o=g.a[v]&~used;while(o){int w=__builtin_ctzll(o);o&=o-1;self(self,w,used|(1ull<<w));}};dfs(dfs,st,1ull<<st);return (int)(count/2);}
int main(){
 std::array<std::set<Shape>,31> found;P origin{0,0,0};Shape path{origin,P{1,0,0}};std::set<P>used(path.begin(),path.end());
 auto dfs=[&](auto&&self,P at)->void{int n=path.size();if(n>=6){bool close=false;for(P q:nbr(at))if(q==origin)close=true;if(close)found[n].insert(canon(path));}if(n==30)return;for(P q:nbr(at)){if(q==origin||used.count(q))continue;used.insert(q);path.push_back(q);self(self,q);path.pop_back();used.erase(q);}};dfs(dfs,path.back());
 int global_max=0;for(int n=6;n<=30;n+=2){int mx=0;for(auto&s:found[n])mx=std::max(mx,cycles(graph(s),2));global_max=std::max(global_max,mx);std::cout<<"n="<<n<<" Hamiltonian_vertex_sets="<<found[n].size()<<" max_cycles="<<mx<<"\n";}
 Shape s38{{0,0,0},{1,0,0},{1,0,-1},{2,0,-1},{2,0,-2},{2,1,-2},{2,1,-3},{2,2,-3},{1,2,-3},{1,3,-3},{1,3,-4},{1,4,-4},{0,4,-4},{0,5,-4},{-1,5,-4},{-1,5,-3},{-2,5,-3},{-2,5,-2},{-2,4,-2},{-2,4,-1},{-2,3,-1},{-1,3,-1},{-1,3,-2},{-1,4,-2},{-1,4,-3},{0,4,-3},{0,3,-3},{0,3,-2},{0,2,-2},{1,2,-2},{1,1,-2},{1,1,-1},{0,1,-1},{0,2,-1},{-1,2,-1},{-1,2,0},{-1,1,0},{0,1,0}};
 G g=graph(s38);int edges=0,d2=0,d3=0;for(auto a:g.a){int d=__builtin_popcountll(a);edges+=d;d2+=d==2;d3+=d==3;}edges/=2;
 std::cout<<"max_cycles_through_30="<<global_max<<"\n";
 std::cout<<"S38 vertices="<<g.n<<" edges="<<edges<<" degree2="<<d2<<" degree3="<<d3<<" Hamiltonian_cycles="<<cycles(g)<<"\n";
}
