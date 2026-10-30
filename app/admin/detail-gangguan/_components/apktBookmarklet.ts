// Bookmarklet "Isi APKT dari Smart" — dijalankan di halaman koreksi APKT
// (browser user sendiri). Smart tidak menyentuh server APKT.
//
// Data datang dari tombol "Salin untuk APKT" di KoreksiModal (JSON di papan klip,
// penanda `smart: "koreksi-apkt"`). Disimpan juga di localStorage APKT supaya
// klik kedua tetap jalan walau papan klip sudah berubah.
//
// Kotak cari "No. Laporan" dan form koreksi ada di HALAMAN YANG SAMA, jadi langkah
// ditentukan dari keadaan halaman, bukan dari ada-tidaknya form:
//   laporan ini belum tampil ("Data Saat Ini" Tgl. Lapor kosong, atau kotak cari
//   berisi nomor lain) → isi kotak cari + tekan Cari
//   sudah tampil → isi kolom "Data Permohonan Koreksi".
//   Nyala Sementara dilewati bila "Data Saat Ini"-nya kosong atau kolomnya terkunci.
//
// Pengenal kolom APKT (id-nya vc-component-N berubah-ubah, jadi tidak dipakai):
//   kotak cari  = input di samping tombol berikon kaca pembesar
//   Data Saat Ini = input sesudah <span>Tgl. Lapor:</span> dst (teks label + titik dua)
//   form        = <span name="tanggalPenugasanRegu"> dst, input tepat sesudahnya

export const APKT_PENANDA = "koreksi-apkt";

export interface DataApkt {
  smart: typeof APKT_PENANDA;
  no: string;
  penugasan: string;
  perjalanan: string;
  pengerjaan: string;
  nyala_sementara: string;
  nyala: string;
  selesai: string;
}

const SUMBER = `(async()=>{
const K='smartKoreksiApkt';
const baca=s=>{try{const o=JSON.parse(s||'');return o&&o.smart==='${APKT_PENANDA}'?o:null}catch(e){return null}};
let d=null;
try{d=baca(await navigator.clipboard.readText())}catch(e){}
if(d)localStorage.setItem(K,JSON.stringify(d));else d=baca(localStorage.getItem(K));
if(!d){d=baca(prompt('Tempel data dari Smart (Ctrl+V lalu Enter):'));if(!d){alert('Data Smart tidak dikenali. Klik "Salin untuk APKT" di Smart dulu.');return}localStorage.setItem(K,JSON.stringify(d))}
const setel=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
const isi=(el,v)=>{el.focus();setel.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));el.dispatchEvent(new KeyboardEvent('keyup',{key:'Enter',code:'Enter',keyCode:13,bubbles:true}));el.blur()};
const lamaVal=t=>{const sp=[...document.querySelectorAll('span')].find(s=>s.textContent.trim()===t);const i=sp&&sp.parentElement.querySelector('input');return i?i.value.trim():''};
const btn=[...document.querySelectorAll('button')].find(b=>b.querySelector('path[d^="M229.66,218.34"]'));
const inp=btn&&btn.parentElement&&btn.parentElement.querySelector('input[type="text"]');
const cariVal=inp?inp.value.trim():'';
const tampil=!!lamaVal('Tgl. Lapor:')&&(cariVal?cariVal===d.no:localStorage.getItem(K+'Cari')===d.no);
if(!tampil){
if(!inp){alert('Kotak cari No. Laporan tidak ditemukan di halaman ini.');return}
isi(inp,d.no);localStorage.setItem(K+'Cari',d.no);setTimeout(()=>btn.click(),150);
return;
}
const smtKosong=!lamaVal('Tgl. Nyala Sementara:');
const M=[['tanggalPenugasanRegu','penugasan'],['tanggalDalamPerjalanan','perjalanan'],['tanggalDalamPengerjaan','pengerjaan'],['tanggalNyalaSementara','nyala_sementara'],['tanggalNyala','nyala'],['tanggalSelesai','selesai']];
const lewat=[],gagal=[];
for(const[n,k]of M){
const sp=document.querySelector('span[name="'+n+'"]');
const el=sp&&sp.nextElementSibling;
if(!el||el.tagName!=='INPUT'){gagal.push(n);continue}
if(n==='tanggalNyalaSementara'&&(smtKosong||el.disabled||el.readOnly)){lewat.push('Nyala Sementara');continue}
isi(el,d[k]);
}
alert('Terisi untuk '+d.no+(lewat.length?'\\nDilewati: '+lewat.join(', '):'')+(gagal.length?'\\nKolom tak ditemukan: '+gagal.join(', '):'')+'\\n\\nPeriksa dulu, lalu tekan Simpan di APKT.');
})()`;

export const APKT_BOOKMARKLET = "javascript:" + encodeURIComponent(SUMBER.replace(/\n/g, ""));
