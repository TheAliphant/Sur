#include <algorithm>
#include <array>
#include <cstdint>
#include <iostream>
#include <map>
#include <set>
#include <unordered_set>
#include <utility>
#include <vector>
using P=std::array<int,3>; using Shape=std::vector<P>;

static Shape norm_tri(Shape s){int a=s[0][0],b=s[0][1];for(auto&p:s){a=std::min(a,p[0]);b=std::min(b,p[1]);}for(auto&p:s){p[0]-=a;p[1]-=b;p[2]=0;}std::sort(s.begin(),s.end());return s;}
static P rot60(P p){return P{-p[1],p[0]+p[1],0};}
static Shape canon_tri(const Shape&s){Shape best;bool first=true;for(int flip=0;flip<2;++flip)for(int r=0;r<6;++r){Shape q;for(P p:s){if(flip)p=P{p[1],p[0],0};for(int k=0;k<r;++k)p=rot60(p);q.push_back(p);}q=norm_tri(q);if(first||q<best){best=q;first=false;}}return best;}

static const std::array<std::array<int,3>,6> perms{{{{0,1,2}},{{0,2,1}},{{1,0,2}},{{1,2,0}},{{2,0,1}},{{2,1,0}}}};
static Shape norm_honey(Shape s){P anchor{0,0,0};bool got=false;for(auto&p:s)if(p[0]+p[1]+p[2]==0&&(!got||p<anchor)){anchor=p;got=true;}if(!got)return {};for(auto&p:s)for(int k=0;k<3;++k)p[k]-=anchor[k];std::sort(s.begin(),s.end());return s;}
static Shape canon_honey(const Shape&s){Shape best;bool first=true;for(auto pm:perms)for(int inv=0;inv<2;++inv){Shape q;for(P p:s){P z{p[pm[0]],p[pm[1]],p[pm[2]]};if(inv)z=P{1-z[0],-z[1],-z[2]};q.push_back(z);}q=norm_honey(q);if(q.empty())continue;if(first||q<best){best=q;first=false;}}return best;}

struct G{int n;std::vector<uint32_t>a;};
static G graph(const Shape&s,const std::vector<P>&dirs){std::map<P,int>ix;for(int i=0;i<(int)s.size();++i)ix[s[i]]=i;G g{(int)s.size(),std::vector<uint32_t>(s.size())};for(int i=0;i<g.n;++i)for(auto d:dirs){P z{s[i][0]+d[0],s[i][1]+d[1],s[i][2]+d[2]};auto it=ix.find(z);if(it!=ix.end())g.a[i]|=1u<<it->second;}return g;}
static bool connected(const G&g){uint32_t seen=1,fr=1;while(fr){uint32_t nx=0;for(uint32_t f=fr;f;f&=f-1)nx|=g.a[__builtin_ctz(f)];nx&=~seen;seen|=nx;fr=nx;}return __builtin_popcount(seen)==g.n;}
static bool ham(const G&g,bool cycle){if(!connected(g))return false;if(g.n==1)return !cycle;int leaves=0;for(auto x:g.a){int d=__builtin_popcount(x);if(d==0||cycle&&d<2)return false;if(d==1)++leaves;}if(!cycle&&leaves>2)return false;uint32_t full=(1u<<g.n)-1;std::vector<int>starts;if(cycle)starts={0};else{for(int i=0;i<g.n;++i)if(__builtin_popcount(g.a[i])==1)starts.push_back(i);if(starts.empty())for(int i=0;i<g.n;++i)starts.push_back(i);}for(int st:starts){std::unordered_set<uint64_t>bad;auto dfs=[&](auto&&self,int v,uint32_t used)->bool{if(used==full)return !cycle||((g.a[v]>>st)&1u);uint64_t key=((uint64_t)used<<5)|v;if(bad.count(key))return false;uint32_t opts=g.a[v]&~used;std::vector<int>o;while(opts){int w=__builtin_ctz(opts);opts&=opts-1;o.push_back(w);}std::sort(o.begin(),o.end(),[&](int x,int y){return __builtin_popcount(g.a[x]&~used)<__builtin_popcount(g.a[y]&~used);});for(int w:o)if(self(self,w,used|(1u<<w)))return true;bad.insert(key);return false;};if(dfs(dfs,st,1u<<st))return true;}return false;}
static void print(const char*n,const std::vector<long long>&v){std::cout<<n<<" = ";for(size_t i=0;i<v.size();++i){if(i)std::cout<<", ";std::cout<<v[i];}std::cout<<"\n";}

int main(){
 const std::vector<P>td{{1,0,0},{-1,0,0},{0,1,0},{0,-1,0},{1,-1,0},{-1,1,0}};
 std::set<Shape>ss;ss.insert(Shape{{0,0,0}});std::vector<long long>p6,c6,all6;
 for(int n=1;n<=12;++n){long long p=0,c=0;for(auto&s:ss){auto g=graph(s,td);p+=ham(g,false);c+=ham(g,true);}all6.push_back(ss.size());p6.push_back(p);c6.push_back(c);if(n==12)break;std::set<Shape>nx;for(auto&s:ss){std::set<P>oc(s.begin(),s.end());for(auto x:s)for(auto d:td){P z{x[0]+d[0],x[1]+d[1],0};if(!oc.count(z)){auto q=s;q.push_back(z);nx.insert(canon_tri(q));}}}ss.swap(nx);}
 const std::vector<P>hd{{1,0,0},{0,1,0},{0,0,1},{-1,0,0},{0,-1,0},{0,0,-1}};
 ss.clear();ss.insert(Shape{{0,0,0}});std::vector<long long>p3,c3,all3;
 for(int n=1;n<=18;++n){long long p=0,c=0;for(auto&s:ss){std::vector<P>dirs;int sum=s[0][0]+s[0][1]+s[0][2];(void)sum;auto g=graph(s,hd);p+=ham(g,false);c+=ham(g,true);}all3.push_back(ss.size());p3.push_back(p);c3.push_back(c);if(n==18)break;std::set<Shape>nx;for(auto&s:ss){std::set<P>oc(s.begin(),s.end());for(auto x:s){int su=x[0]+x[1]+x[2];for(int k=0;k<3;++k){P z=x;z[k]+=su==0?1:-1;if(!oc.count(z)){auto q=s;q.push_back(z);nx.insert(canon_honey(q));}}}}ss.swap(nx);}
 print("polyhexes(1..12)",all6);print("P6(1..12)",p6);print("C6(1..12)",c6);print("polyiamonds(1..18)",all3);print("P3(1..18)",p3);print("C3(1..18)",c3);
}
