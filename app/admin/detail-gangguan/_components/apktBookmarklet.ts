// Bookmarklet "Isi APKT dari Smart" — dijalankan di halaman koreksi APKT
// (browser user sendiri). Smart tidak menyentuh server APKT.
//
// Data datang dari Smart lewat papan klip: satu laporan (tombol di modal Koreksi)
// atau ANTREAN banyak laporan (tombol di tabel). Antrean disimpan di localStorage
// APKT, jadi cukup klik bookmark SEKALI. Per laporan:
//   1. tanya Smart (`/api/apkt/koreksi/cek`, bertoken): koreksinya masih ada,
//      belum masuk APKT (PC lain), dan waktunya yang TERBARU dipakai;
//   2. cari laporan → tunggu sampai "Data Saat Ini" menampilkan laporan INI
//      (Tgl. Lapor + Nama Pelapor sama dengan Smart), bukan sekadar berubah.
//      Nama di unduhan APKT disamarkan ("Okky Mul***") sedangkan layar APKT
//      lengkap → "*" = huruf apa saja, bagian yang terlihat harus cocok;
//   3. aturan user: RPT/RCT ASLI (dihitung dari "Data Saat Ini" APKT, bukan
//      dari impor) lebih kecil daripada koreksi → dilewati + diberi tahu;
//   4. isi Grup JARINGAN → tunggu Alasan dimuat → AKSES JARINGAN LAN →
//      Jml Pelanggan 1 → 6 waktu → BACA ULANG semua isian;
//   5. user menekan Simpan → isian DIPERIKSA LAGI saat itu juga; tidak cocok =
//      Simpan DITAHAN (pendengar fase capture, sebelum APKT menerimanya);
//   6. tersimpan HANYA bila muncul modal sukses APKT ("Sukses" + "Berhasil
//      melakukan permohonan …") → OK ditekan → laporan berikutnya. Modal lain
//      atau kata galat = berhenti, tidak menebak (keputusan user 19 Nov).
// Penanda "Sudah dikoreksi" ke Smart dicatat dulu di localStorage APKT lalu
// dikirim (dan diulang) sampai server menjawab — sinyal putus tidak menghilangkannya.
//
// Pengenal kolom APKT (id vc-component-N berubah-ubah, jadi tidak dipakai):
//   kotak cari    = input di samping tombol berikon kaca pembesar
//   Data Saat Ini = input sesudah <span>Tgl. Lapor:</span> dst
//   form waktu    = <span name="tanggalPenugasanRegu"> dst, input tepat sesudahnya
//   Jml Pelanggan = #jumlahPelangganPadam
//   Grup / Alasan = label[for=grupKoreksi|alasanPelapor]. Pilihan APKT berupa
//                   button[role=option] yang BARU DIMUAT dari server saat dropdown
//                   dibuka (diagnosa APKT asli 19 Nov) → buka dulu, tunggu, klik.

export const APKT_ANTREAN = "antrean-apkt";

export const APKT_GRUP = "JARINGAN";
export const APKT_ALASAN = "AKSES JARINGAN LAN";
export const APKT_JML_PELANGGAN = "1";
/** Modal sukses APKT (19 Nov 2026): "Sukses / Berhasil melakukan permohonan Z44… / OK". */
export const APKT_MODAL_SUKSES = ["sukses", "berhasil melakukan permohonan"];
const APKT_KATA_GALAT = ["gagal", "error", "failed", "tidak dapat", "tidak boleh", "tidak valid", "harus", "wajib", "salah", "sudah ada", "sudah pernah"];

export interface ItemApkt {
  no: string;
  penugasan: string;
  perjalanan: string;
  pengerjaan: string;
  nyala_sementara: string;
  nyala: string;
  selesai: string;
  /** Pengenal laporan di APKT — dicocokkan dengan "Data Saat Ini" sebelum mengisi. */
  waktu_lapor?: string | null;
  nama_pelapor?: string | null;
  /** RPT/RCT sebelum & sesudah koreksi (menit). */
  rpt_asli?: number | null;
  rpt_koreksi?: number | null;
  rct_asli?: number | null;
  rct_koreksi?: number | null;
}

/** Teks papan klip untuk bookmark. */
export function antreanApkt(token: string | null, daftar: ItemApkt[], minRpt = 0): string {
  return JSON.stringify({ smart: APKT_ANTREAN, asal: window.location.origin, t: token, minRpt, daftar });
}

// ⚠ Baris baru dibuang saat dirakit: JANGAN pakai komentar // , akhiri tiap
// pernyataan dengan titik koma, dan JANGAN pakai backslash di regex (\d dsb.
// hilang di template literal). "\\n" = baris baru di dalam teks pesan.
const SUMBER = `(async()=>{
const P='${APKT_ANTREAN}',K='smartAntreanApkt',KS='smartApktSelesai',KP='smartApktTunda';
const SUKSES=${JSON.stringify(APKT_MODAL_SUKSES)},GALAT=${JSON.stringify(APKT_KATA_GALAT)};
const GRUP='${APKT_GRUP}',ALASAN='${APKT_ALASAN}',JML='${APKT_JML_PELANGGAN}';
const W=window.__smartApktV3=window.__smartApktV3||{gen:0,lewat:[],alasanLewat:{}};if(window.__smartApkt)window.__smartApkt.aktif=null;
W.alasanLewat=W.alasanLewat||{};
const tidur=ms=>new Promise(r=>setTimeout(r,ms));
const BIRU='#1e3a5f',HIJAU='#166534',KUNING='#92400e',MERAH='#991b1b';
const tutup=()=>{const b=document.getElementById('smartApktBanner');if(b)b.remove();};
const fm=m=>{m=Math.round(Number(m));if(!(m>0))return '–';return m>=60?Math.floor(m/60)+'j '+(m%60)+'m':m+' menit';};
const bacaJson=(k,d)=>{try{return JSON.parse(localStorage.getItem(k)||'')||d;}catch(e){return d;}};
const selesai=()=>bacaJson(KS,[]);
const tunda=()=>bacaJson(KP,[]);
const pesan=(teks,warna,tombol)=>{let b=document.getElementById('smartApktBanner');if(!b){b=document.createElement('div');b.id='smartApktBanner';b.style.cssText='position:fixed;top:12px;right:12px;z-index:2147483647;width:440px;max-width:calc(100vw - 24px);max-height:calc(100vh - 24px);overflow:auto;padding:16px 18px;border-radius:12px;font:15px/1.5 sans-serif;color:#fff;box-shadow:0 8px 28px rgba(0,0,0,.35)';document.body.appendChild(b);}b.style.background=warna||BIRU;b.textContent='';
const d=W.kini;if(d){const h=document.createElement('div');h.style.cssText='display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin-bottom:8px';const no=document.createElement('b');no.style.fontSize='19px';no.textContent=d.no;const ps=document.createElement('span');ps.style.cssText='font-size:13px;opacity:.85;text-align:right';const nt=tunda().length;ps.textContent=posisi()+(W.jumlah?' · tersimpan '+W.jumlah:'')+(nt?' · '+nt+' belum terlapor ke Smart':'');h.appendChild(no);h.appendChild(ps);b.appendChild(h);
if(d.rpt_asli!=null||d.rct_asli!=null){const g=document.createElement('div');g.style.cssText='display:grid;grid-template-columns:auto 1fr;gap:4px 14px;align-items:baseline;background:rgba(255,255,255,.14);border-radius:8px;padding:10px 12px;margin-bottom:10px';[['RPT',d.rpt_asli,d.rpt_koreksi],['RCT',d.rct_asli,d.rct_koreksi]].forEach(([l,a,k])=>{const x=document.createElement('span');x.style.cssText='font-size:13px;opacity:.85';x.textContent=l;const y=document.createElement('span');const s1=document.createElement('s');s1.style.opacity='.7';s1.textContent=fm(a);const s2=document.createElement('b');s2.style.fontSize='18px';s2.textContent=fm(k);y.appendChild(s1);y.appendChild(document.createTextNode('  →  '));y.appendChild(s2);g.appendChild(x);g.appendChild(y);});b.appendChild(g);}}
const p=document.createElement('div');p.style.whiteSpace='pre-line';p.textContent=teks;b.appendChild(p);(tombol||[]).forEach(([l,f])=>{const t=document.createElement('button');t.type='button';t.textContent=l;t.style.cssText='margin:10px 8px 0 0;padding:6px 14px;border-radius:7px;border:0;background:#fff;color:#1e3a5f;font:600 14px sans-serif;cursor:pointer';t.onclick=f;b.appendChild(t);});};
const baca=s=>{try{const o=JSON.parse(s||'');if(o&&o.smart===P&&Array.isArray(o.daftar))return o;return null;}catch(e){return null;}};
let raw='';try{raw=await navigator.clipboard.readText();}catch(e){}
if(baca(raw)&&raw!==localStorage.getItem(K)){localStorage.setItem(K,raw);W.lewat=[];W.alasanLewat={};}
let q=baca(localStorage.getItem(K));
if(!q){const r=prompt('Tempel antrean dari Smart (Ctrl+V lalu Enter):');q=baca(r);if(!q){alert('Data Smart tidak dikenali. Salin antrean di Smart dulu.');return;}localStorage.setItem(K,r);W.lewat=[];W.alasanLewat={};}
const urlSmart=(jalur,no)=>q.asal+'/api/apkt/koreksi/'+jalur+'?no='+encodeURIComponent(no)+'&t='+encodeURIComponent(q.t||'');
const kirimTunda=async()=>{if(!q.asal||W.mengirim)return;W.mengirim=true;try{for(const no of tunda()){try{const r=await fetch(urlSmart('masuk',no));if(r.ok)localStorage.setItem(KP,JSON.stringify(tunda().filter(x=>x!==no)));else if(r.status===403)W.tokenMati=true;}catch(e){}}}finally{W.mengirim=false;}};
const tandai=no=>{const s=selesai().filter(x=>x!==no);s.push(no);localStorage.setItem(KS,JSON.stringify(s.slice(-3000)));const t=tunda().filter(x=>x!==no);t.push(no);localStorage.setItem(KP,JSON.stringify(t));kirimTunda();};
const tandaiLokal=no=>{const s=selesai().filter(x=>x!==no);s.push(no);localStorage.setItem(KS,JSON.stringify(s.slice(-3000)));};
const berikut=()=>{const s=new Set(selesai());return q.daftar.find(d=>!s.has(d.no)&&!W.lewat.includes(d.no));};
const posisi=()=>{const s=new Set(selesai());const sisa=q.daftar.filter(x=>!s.has(x.no)).length;return 'laporan '+(q.daftar.length-sisa+1)+' dari '+q.daftar.length;};
const setel=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
const isi=(el,v)=>{el.focus();setel.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));el.dispatchEvent(new KeyboardEvent('keyup',{key:'Enter',code:'Enter',keyCode:13,bubbles:true}));el.blur();};
const lamaVal=t=>{const sp=[...document.querySelectorAll('span')].find(s=>s.textContent.trim()===t);const i=sp&&sp.parentElement.querySelector('input,textarea');return i?i.value.trim():'';};
const tanda=()=>['Tgl. Lapor:','Nama Pelapor:','Alamat Pelapor:'].map(lamaVal).join('|');
const kotakCari=()=>{const btn=[...document.querySelectorAll('button')].find(b=>b.querySelector('path[d^="M229.66,218.34"]'));const inp=btn&&btn.parentElement&&btn.parentElement.querySelector('input[type="text"]');return {btn,inp};};
const isianWaktu=n=>{const sp=document.querySelector('span[name="'+n+'"]');const el=sp&&sp.nextElementSibling;return el&&el.tagName==='INPUT'?el:null;};
const pembuat=hidup=>async(f,ms)=>{const akhir=Date.now()+ms;while(hidup()&&Date.now()<akhir){const v=f();if(v)return v;await tidur(300);}return null;};
const tampak=e=>!!(e.offsetWidth||e.offsetHeight||e.getClientRects().length);
const urai=s=>{const n=String(s||'').replace(/[^0-9]+/g,' ').trim().split(' ').filter(Boolean).map(Number);if(n.length<5)return null;let d,m,y;if(n[0]>31){y=n[0];m=n[1];d=n[2];}else{d=n[0];m=n[1];y=n[2];}return {t:new Date(y,m-1,d,n[3],n[4],n[5]||0).getTime(),detik:n.length>=6};};
const samaWaktu=(a,b)=>{const x=urai(a),y=urai(b);if(!x||!y)return false;return x.detik&&y.detik?x.t===y.t:Math.floor(x.t/60000)===Math.floor(y.t/60000);};
const nmNorm=s=>String(s||'').toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim();
const cocokNama=(a,b)=>{a=String(a||'');b=String(b||'');if(!a||!b)return true;const m=a.includes('*')?a:b.includes('*')?b:null;if(!m)return nmNorm(a)===nmNorm(b);const t=nmNorm(m===a?b:a);const seg=m.split('*').map(nmNorm).filter(Boolean);let i=0;for(let x=0;x<seg.length;x++){const j=t.indexOf(seg[x],i);if(j<0||(x===0&&!m.trim().startsWith('*')&&j!==0))return false;i=j+seg[x].length;}return true;};
const laporIni=d=>{const lp=lamaVal('Tgl. Lapor:');if(!lp||!d.waktu_lapor||!samaWaktu(lp,d.waktu_lapor))return false;return cocokNama(lamaVal('Nama Pelapor:'),d.nama_pelapor);};
const tolakLive=d=>{const lp=urai(lamaVal('Tgl. Lapor:')),pg=urai(lamaVal('Tgl. Dalam Pengerjaan:')),ny=urai(lamaVal('Tgl. Nyala:'));if(!lp||!pg||!ny)return 'Data Saat Ini APKT tidak lengkap (Pengerjaan/Nyala kosong)';const rpt=(pg.t-lp.t)/60000,rct=(ny.t-lp.t)/60000;const mn=Number(q.minRpt)||0;if(mn>0&&rpt<=mn+0.001)return 'RPT asli di APKT '+fm(rpt)+', tidak di atas batas '+fm(mn);const s=[];if(rpt+0.001<Number(d.rpt_koreksi))s.push('RPT '+fm(rpt)+' → '+fm(d.rpt_koreksi));if(rct+0.001<Number(d.rct_koreksi))s.push('RCT '+fm(rct)+' → '+fm(d.rct_koreksi));return s.length?'Waktu asli di APKT sudah lebih cepat ('+s.join(', ')+')':null;};
const M=[['tanggalPenugasanRegu','penugasan','Penugasan'],['tanggalDalamPerjalanan','perjalanan','Perjalanan'],['tanggalDalamPengerjaan','pengerjaan','Pengerjaan'],['tanggalNyalaSementara','nyala_sementara','Nyala Sementara'],['tanggalNyala','nyala','Nyala'],['tanggalSelesai','selesai','Selesai']];
const teksPilihan=id=>{const lab=[...document.querySelectorAll('label[for="'+id+'"]')].map(l=>l.parentElement).find(w=>w&&w.querySelector('.dropdown > button'));const t=lab&&lab.querySelector('.dropdown > button');return t?t.textContent.trim():'';};
W.cekIsian=d=>{const s=[];if(!laporIni(d))s.push('laporan yang tampil bukan '+d.no);for(const [n,k,l] of M){if(n==='tanggalNyalaSementara'&&d.lewatSmt)continue;const el=isianWaktu(n);if(!el||!samaWaktu(el.value,d[k]))s.push(l+' ('+(el?el.value||'kosong':'tidak ada')+')');}if(teksPilihan('grupKoreksi')!==GRUP)s.push('Grup Koreksi');if(teksPilihan('alasanPelapor')!==ALASAN)s.push('Alasan Pelapor');const jp=document.getElementById('jumlahPelangganPadam');if(!jp||jp.value.trim()!==JML)s.push('Jml Pelanggan Padam');return s;};
const pilih=async(id,teks,batas,tunggu)=>{
const dg=[];const catat=()=>{W.diag[id]=dg.join(', ');return false;};
const ev=(el,n)=>el.dispatchEvent(new MouseEvent(n,{bubbles:true,cancelable:true,view:window}));
const labs=[...document.querySelectorAll('label[for="'+id+'"]')];
const wadah=labs.map(l=>l.parentElement).find(w=>w&&w.querySelector('.dropdown > button')&&tampak(w))||(labs[0]?labs[0].parentElement:null);
dg.push('label '+labs.length);
if(!wadah)return catat();
const sel=wadah.querySelector('select')||document.getElementById(id);
const tombol=()=>wadah.querySelector('.dropdown > button')||wadah.querySelector('button');
const teksTombol=()=>{const t=tombol();return t?t.textContent.trim():'(tanpa tombol)';};
const terpilih=()=>teksTombol()===teks;
dg.push('awal "'+teksTombol()+'"');
if(terpilih())return true;
const opsi=()=>[...document.querySelectorAll('[role="option"]')].filter(b=>b.textContent.trim()===teks);
const adaOpsi=()=>opsi().length>0;
const t=tombol();
const terbuka=()=>(t&&t.getAttribute('aria-expanded')==='true')||[...document.querySelectorAll('input[type="search"][data-rich-select-focusable]')].some(tampak)||opsi().some(tampak);
const buka=async()=>{if(!t||terbuka())return terbuka();t.focus();t.click();if(await tunggu(terbuka,1000))return true;ev(t,'mousedown');ev(t,'mouseup');if(await tunggu(terbuka,1000))return true;t.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',code:'ArrowDown',keyCode:40,bubbles:true}));return !!(await tunggu(terbuka,1000));};
const akhir=Date.now()+batas;let kali=0;
while(!adaOpsi()&&Date.now()<akhir&&kali<4){kali++;await buka();await tunggu(adaOpsi,Math.min(12000,Math.max(500,akhir-Date.now())));}
dg.push('buka '+(terbuka()?'ya':'tidak')+' x'+kali);
dg.push('opsi '+opsi().length+(sel?' select '+sel.options.length:''));
const kenaKlik=async(el,cara)=>{if(cara===1)el.click();else{ev(el,'mousedown');ev(el,'mouseup');ev(el,'click');}return !!(await tunggu(terpilih,1500));};
if(adaOpsi()){
if(!opsi().some(tampak))await buka();
for(const cara of [1,2]){const ob=opsi().find(tampak);if(ob&&await kenaKlik(ob,cara))return true;}
for(const b of opsi()){if(terpilih())return true;if(b.getAttribute('aria-selected')==='true')continue;if(await kenaKlik(b,1))return true;}
}
if(sel){const so=[...sel.options].find(o=>o.textContent.trim()===teks);if(so){sel.value=so.value;sel.dispatchEvent(new Event('input',{bubbles:true}));sel.dispatchEvent(new Event('change',{bubbles:true}));if(await tunggu(terpilih,1500))return true;}}
dg.push('akhir "'+teksTombol()+'"');
return catat();
};
const cekSmart=async d=>{if(!q.asal||!q.t)return {galat:'Antrean tanpa token Smart. Salin ulang antrean dari Smart.'};for(let i=0;i<3;i++){try{const r=await fetch(urlSmart('cek',d.no));if(r.status===403)return {galat:'Token antrean sudah kedaluwarsa. Salin antrean baru dari Smart.'};if(!r.ok)throw new Error('http '+r.status);const j=await r.json();if(!j.ada)return {lewat:'koreksinya tidak ada lagi di Smart'};if(j.masuk)return {sudah:true};return {ok:{...d,...j.item}};}catch(e){await tidur(3000);}}return {putus:true};};
const jalan=async()=>{
const g=++W.gen;const hidup=()=>W.gen===g;const tunggu=pembuat(hidup);
W.aktif=null;W.diag={};if(W.diagModal){W.diag.modal=W.diagModal;W.diagModal=null;}
kirimTunda();
let d=berikut();W.kini=d||null;
if(!d){const n=W.lewat.length;pesan('Antrean selesai.'+(n?'\\n'+n+' laporan dilewati:\\n'+W.lewat.map(x=>x+(W.alasanLewat[x]?' — '+W.alasanLewat[x]:'')).join('\\n'):'')+(tunda().length?'\\n\\n'+tunda().length+' laporan belum terlapor ke Smart — biarkan halaman ini terbuka, dikirim ulang otomatis.':''),n?KUNING:HIJAU,[['Tutup',tutup]]);if(tunda().length){await tidur(15000);if(hidup())jalan();}return;}
const lewatkan=(alasan)=>{W.lewat.push(d.no);if(alasan)W.alasanLewat[d.no]=alasan;jalan();};
const lewatkanTombol=()=>lewatkan('dilewati manual');
if(W.tokenMati){pesan('Token antrean sudah kedaluwarsa — penanda ke Smart tidak bisa dikirim.\\nSalin antrean baru dari Smart, lalu klik bookmark lagi.',MERAH,[['Tutup',tutup]]);return;}
pesan('Memeriksa koreksi di Smart …');
const c=await cekSmart(d);if(!hidup())return;
if(c.galat){pesan(c.galat,MERAH,[['Tutup',tutup]]);return;}
if(c.putus){pesan('Tidak bisa menghubungi Smart untuk memeriksa '+d.no+' (sinyal?).\\nTidak diisi supaya tidak memakai data lama.',KUNING,[['Coba lagi',jalan],['Lewati',lewatkanTombol],['Tutup',tutup]]);return;}
if(c.sudah){tandaiLokal(d.no);pesan('Sudah dikoreksi di APKT (dari PC lain). Lanjut …',HIJAU);await tidur(1200);if(hidup())jalan();return;}
if(c.lewat){pesan('Dilewati: '+c.lewat+'. Lanjut …',KUNING);await tidur(2500);if(hidup())lewatkan(c.lewat);return;}
d=c.ok;W.kini=d;
const {btn,inp}=kotakCari();
if(!(laporIni(d)&&inp&&inp.value.trim()===d.no)){
if(!inp||!btn){pesan('Kotak cari No. Laporan tidak ditemukan. Buka halaman koreksi APKT dulu, lalu klik bookmark lagi.',MERAH,[['Tutup',tutup]]);return;}
const sblm=tanda();isi(inp,d.no);await tidur(150);btn.click();
pesan('Mencari laporan di APKT …');
const ok=await tunggu(()=>laporIni(d)||(lamaVal('Tgl. Lapor:')&&tanda()!==sblm&&inp.value.trim()===d.no?'beda':null),45000);
if(!hidup())return;
if(!ok){pesan('APKT belum menampilkan '+d.no+'.\\nSinyal lambat, atau laporan tidak ditemukan di APKT.',KUNING,[['Coba lagi',jalan],['Lewati',lewatkanTombol],['Tutup',tutup]]);return;}
await tidur(500);
if(!laporIni(d)){pesan('Laporan yang tampil di APKT TIDAK SAMA dengan Smart.\\nAPKT: '+lamaVal('Tgl. Lapor:')+' · '+lamaVal('Nama Pelapor:')+'\\nSmart: '+d.waktu_lapor+' · '+(d.nama_pelapor||'-')+'\\n\\nTidak diisi. Bila sinyal lambat, Coba lagi; bila waktu lapor di APKT sudah berubah, koreksi di Smart perlu dihitung ulang.',MERAH,[['Coba lagi',jalan],['Lewati',()=>lewatkan('Tgl. Lapor di APKT beda dengan Smart')],['Tutup',tutup]]);return;}
}
const tol=tolakLive(d);
if(tol){pesan('Dilewati, koreksi tidak dilakukan:\\n'+tol+'. Lanjut …',KUNING);await tidur(3000);if(hidup())lewatkan(tol);return;}
const gagal=[];
pesan('Memilih Grup Koreksi …');
if(!await pilih('grupKoreksi',GRUP,20000,tunggu))gagal.push('Grup Koreksi');
pesan('Menunggu pilihan Alasan Pelapor dari APKT …');if(!await pilih('alasanPelapor',ALASAN,45000,tunggu))gagal.push('Alasan Pelapor');
if(!hidup())return;
if(!laporIni(d)){pesan('Laporan di APKT berganti saat mengisi. Tidak diisi.',MERAH,[['Coba lagi',jalan],['Lewati',lewatkanTombol],['Tutup',tutup]]);return;}
const jp=document.getElementById('jumlahPelangganPadam');if(jp)isi(jp,JML);
const smtKosong=!lamaVal('Tgl. Nyala Sementara:');d.lewatSmt=false;
for(const [n,k] of M){const el=isianWaktu(n);if(!el)continue;if(n==='tanggalNyalaSementara'&&(smtKosong||el.disabled||el.readOnly)){d.lewatSmt=true;continue;}isi(el,d[k]);}
await tidur(400);
const salah=W.cekIsian(d);
W.aktif=d;W.lewatkan=lewatkanTombol;
const dg=Object.keys(W.diag).length?'\\n(diagnosa: '+Object.entries(W.diag).map(([k,v])=>k+': '+v).join(' | ')+')':'';
if(salah.length){pesan('Isian BELUM sesuai Smart: '+salah.join(', ')+'.\\nSimpan akan DITAHAN sampai sesuai. Isi manual, atau Isi ulang.'+dg,KUNING,[['Isi ulang',jalan],['Lewati',lewatkanTombol],['Tutup',tutup]]);return;}
pesan('Terisi & sudah dicocokkan dengan Smart.'+(d.lewatSmt?'\\nNyala Sementara dilewati (kosong di APKT).':'')+dg+'\\n\\nPeriksa, lalu tekan Simpan di APKT. Laporan berikutnya dibuka sendiri setelah modal Sukses.',BIRU,[['Lewati',lewatkanTombol],['Tutup',tutup]]);
};
const kotakModal=b=>{let p=b;for(let i=0;i<10&&p.parentElement&&p.parentElement!==document.body;i++){p=p.parentElement;if(p.getAttribute('role')==='dialog'||/modal|swal2-popup|dialog/i.test(String(p.className)))break;}return p;};
W.setelahSimpan=async d=>{
W.menyimpan=true;const g=++W.gen;const hidup=()=>W.gen===g;const tunggu=pembuat(hidup);
let galat=null;
const obs=new MutationObserver(ms=>{for(const m of ms)for(const n of m.addedNodes){if(n.nodeType!==1&&n.nodeType!==3)continue;const el=n.nodeType===1?n:n.parentElement;if(el&&el.closest&&el.closest('#smartApktBanner'))continue;const t=(n.textContent||'').trim().toLowerCase();if(t&&!galat&&GALAT.some(k=>t.includes(k)))galat=(n.textContent||'').trim().slice(0,200);}});
obs.observe(document.body,{childList:true,subtree:true});
pesan('Menunggu APKT menyimpan '+d.no+' …');
const TUTUP=['ok','oke','selesai','ya','tutup','close'];
const tombolModal=()=>[...document.querySelectorAll('button,.swal2-confirm,[role="button"]')].filter(b=>(TUTUP.includes(b.textContent.trim().toLowerCase())||b.classList.contains('swal2-confirm'))&&tampak(b)&&!b.closest('#smartApktBanner'));
const sblm=new Set(tombolModal());
const baru=()=>tombolModal().find(b=>!sblm.has(b));
const sb=await tunggu(()=>baru()||(galat?'galat':null),60000);
obs.disconnect();W.menyimpan=false;
if(!hidup())return;
const lanjut=()=>{tandai(d.no);W.jumlah=(W.jumlah||0)+1;jalan();};
if(!sb){pesan('Belum muncul modal Sukses dari APKT untuk '+d.no+' (sinyal lambat?).\\nLihat APKT: kalau sudah tersimpan klik Sudah tersimpan; kalau belum, tekan Simpan lagi.',KUNING,[['Sudah tersimpan',lanjut],['Lewati',W.lewatkan],['Tutup',tutup]]);return;}
const teks=sb==='galat'?galat:(kotakModal(sb).innerText||'').trim();
const kecil=teks.toLowerCase();
const sukses=sb!=='galat'&&SUKSES.every(k=>kecil.includes(k))&&!GALAT.some(k=>kecil.includes(k));
if(!sukses){pesan((GALAT.some(k=>kecil.includes(k))?'APKT menolak / memberi galat':'Modal APKT tidak dikenal — tidak dilanjutkan')+' untuk '+d.no+':\\n'+teks.slice(0,300)+'\\n\\nBaca modal di APKT. Bila sebenarnya sudah tersimpan klik Sudah tersimpan; bila belum, perbaiki lalu Simpan lagi.',MERAH,[['Sudah tersimpan',lanjut],['Lewati',W.lewatkan],['Tutup',tutup]]);return;}
const hilang=()=>!document.contains(sb)||!tampak(sb);
sb.click();if(!await tunggu(hilang,1500)){['mousedown','mouseup','click'].forEach(n=>sb.dispatchEvent(new MouseEvent(n,{bubbles:true,cancelable:true,view:window})));await tunggu(hilang,2000);}
if(!hilang())W.diagModal='modal Sukses belum tertutup ("'+sb.textContent.trim()+'")';
if(!hidup())return;
tandai(d.no);W.jumlah=(W.jumlah||0)+1;W.aktif=null;
const noZ=(teks.match(/Z[0-9]+/)||[''])[0];
pesan('✓ Tersimpan di APKT'+(noZ?' (permohonan '+noZ+')':'')+'. Membuka laporan berikutnya …',HIJAU);await tidur(1500);if(hidup())jalan();
};
W.tahan=s=>pesan('Simpan DITAHAN — isian tidak sesuai Smart:\\n'+s.join(', ')+'\\n\\nTidak ada yang dikirim ke APKT.',MERAH,[['Isi ulang',jalan],['Lewati',W.lewatkan],['Tutup',tutup]]);
W.jalan=jalan;
if(!W.dengar){W.dengar=true;document.addEventListener('click',e=>{const b=e.target&&e.target.closest&&e.target.closest('button');if(!b||b.textContent.trim()!=='Simpan'||!W.aktif||W.menyimpan)return;const s=W.cekIsian(W.aktif);if(s.length){e.preventDefault();e.stopImmediatePropagation();W.tahan(s);return;}if(!b.disabled)W.setelahSimpan(W.aktif);},true);}
jalan();
})()`;

export const APKT_BOOKMARKLET = "javascript:" + encodeURIComponent(SUMBER.replace(/\n/g, ""));
