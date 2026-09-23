// =====================================================================
// SOP MANAJEMEN ASET (Sarana & Prasarana) — YPI Darussunah.
// Diangkat dari "Panduan Pengelolaan Aset" (juknis) agar SOP tiap area
// menempel pada fiturnya & selalu ikut versi terbaru aplikasi.
//
// Bentuk data ringkas: tiap area punya prinsip/tujuan/prosedur/wewenang/
// dokumen. Dirender oleh <SopContent> & <SopPanel> (lihat AsetList).
// Ini dokumen milik yayasan sendiri — sengaja ditampilkan sebagai acuan
// kerja staf, bukan formulir.
// =====================================================================

// Susunan PIC & wewenang umum (BAB II) — dipakai lintas area.
export const PIC_SARPRAS = [
  ['Ketua Yayasan', 'Pemegang kekuasaan seluruh aset. Menetapkan kebijakan, menyetujui anggaran, mengesahkan perencanaan, penggunaan, pemindahtanganan & penghapusan aset.'],
  ['Pengurus Yayasan Bidang Sarpras', 'Pengelola aset. Memeriksa & menyetujui usulan kebutuhan/pemeliharaan satuan pendidikan; mengawasi & mengendalikan tata kelola aset.'],
  ['Kepala Sekolah / Mudir', 'Pengguna aset. Mengajukan kebutuhan, menatausahakan, menggunakan, mengamankan & memelihara aset, mengusulkan penghapusan, melapor ke Yayasan.'],
  ['Wakasek/PKS Sarpras', 'Kuasa pengguna aset (pelimpahan dari Kepala Sekolah) sesuai beban & rentang kendali.'],
  ['Tata Usaha', 'Staf penatausahaan. Menyiapkan rencana kebutuhan, mencatat aset, menandatangani SPA & menerbitkan SPPA, memverifikasi KIR tiap semester/tahun.'],
  ['Sarpras & OB', 'Pengurus & penyimpan aset. Menerima, menyimpan, menyalurkan, memberi label kodefikasi, stock opname persediaan, menyimpan dokumen kepemilikan.'],
]

export const SOP_SARPRAS = {
  perencanaan: {
    label: 'Perencanaan Kebutuhan Aset',
    bab: 'BAB III',
    ringkas: 'Perencanaan kebutuhan pengadaan & pemeliharaan aset, disusun tiap akhir tahun anggaran berpedoman 3 standar (aset, kebutuhan, harga).',
    prinsip: [
      'Berpedoman pada 3 standar yang ditetapkan Ketua Yayasan: standar aset (spesifikasi), standar kebutuhan (jumlah ideal), dan standar harga (harga maksimal).',
      'Dilakukan setiap akhir tahun anggaran, memperhatikan program kerja tahunan, RKAS, serta kemampuan keuangan YPI.',
      'Meliputi dua hal: perencanaan kebutuhan pengadaan aset dan perencanaan kebutuhan pemeliharaan aset.',
    ],
    tujuan: ['Mengakomodir seluruh kebutuhan tiap satuan pendidikan secara lengkap, akurat, dan tertelusur.'],
    prosedur: [
      'Unit kerja menyusun daftar rencana kebutuhan (aset apa, di mana, untuk apa, berapa biaya, siapa pengguna, alasan, cara pengadaan, spesifikasi).',
      'Kepala Sekolah/Mudir menghimpun rencana kebutuhan satu tahun anggaran + standarisasi sarana & harga.',
      'Rencana kebutuhan pengadaan memuat minimal: Nama Proker/Kegiatan, Nama Aset, Merk & Spesifikasi, Jumlah Pengajuan, Satuan, Harga Satuan, Jumlah Harga, Sumber Anggaran, Jumlah Maksimal Kebutuhan, Jumlah Tersedia, Jumlah Riil Kebutuhan.',
      'Rencana kebutuhan pemeliharaan memuat minimal: Nama Kegiatan; data aset (kode, nama, jumlah, lokasi); kondisi (baik/rusak ringan/rusak berat); uraian pemeliharaan (jenis, volume, harga satuan, jumlah biaya).',
      'Kepala Sekolah/Mudir menyampaikan ke Pengurus Yayasan Bidang Sarpras.',
      'Yayasan memverifikasi & menetapkan lewat rapat pengurus → menjadi Daftar Kebutuhan Aset (DKA) satu tahun anggaran.',
      'DKA yang disahkan dipakai menyusun RKAS Sarana & Prasarana.',
    ],
    wewenang: [
      'Ketua Yayasan: mengambil keputusan penerimaan & pengeluaran aset.',
      'Kepala Sekolah/Mudir: bertanggung jawab atas perencanaan kebutuhan & pengusulan.',
    ],
    dokumen: ['Rencana kebutuhan pengadaan & pemeliharaan', 'Dokumen sumber (Buku Inventaris, KIA)', 'Dokumen Daftar Kebutuhan Aset (DKA)'],
    kondisiKhusus: 'Pengadaan insidental di luar DKA tetap mengikuti 3 standar perencanaan & prosedur yang ditetapkan.',
  },

  pengadaan: {
    label: 'Pengadaan Aset',
    bab: 'BAB IV',
    ringkas: 'Pelaksanaan pengadaan (pembelian/pengadaan langsung, swakelola, hibah/wakaf) berdasarkan DKA yang disahkan, sampai serah terima.',
    prinsip: [
      'Efisien, efektif, transparan, berdaya saing, adil, dan akuntabel.',
      'Cara: pembelian, swakelola (membuat sendiri), penerimaan (hibah/donasi/bantuan), atau tukar menukar.',
      'Pembelian langsung memakai bukti pembelian & kuitansi; pengadaan langsung (Rp50–200 juta) memakai Surat Perintah Kerja (SPK).',
    ],
    tujuan: ['Memastikan tiap pengadaan tertib administrasi demi pendayagunaan aset yang maksimal.'],
    prosedur: [
      'Kepala Sekolah/Mudir menyiapkan dokumen/kerangka kerja pengadaan (jumlah, merk & spesifikasi, harga satuan & jumlah, waktu & lokasi, pagu anggaran, persyaratan penyedia).',
      'Dokumen disusun berdasarkan DKA yang ditetapkan & RKAS satuan pendidikan.',
      'Dokumen diperiksa Pengurus Yayasan Bidang Sarpras & disetujui Ketua YPI.',
      'Pelaksanaan: menetapkan penyedia; memesan dengan Surat Pesanan (kecuali < Rp50 juta); minta surat penawaran/invoice; membandingkan ≥2 penyedia bila > Rp50 juta; wajib SPK setelah sepakat harga.',
      'Serah terima: wajib pemeriksaan aset (berita acara pemeriksaan); jika tidak sesuai minta penyesuaian; aset diterima setelah sesuai (berita acara serah terima); pembayaran setelah BAST disetujui.',
    ],
    wewenang: [
      'Kepala Sekolah/Mudir: pelaksana pengadaan; dapat menunjuk PTK sebagai panitia.',
      'Pengurus Yayasan Bidang Sarpras: memastikan pengadaan sesuai tata kelola.',
      'Ketua Yayasan: menetapkan proses pengadaan.',
    ],
    dokumen: ['Kerangka Kerja Pengadaan', 'Surat Penawaran/Invoice', 'Surat Perintah Kerja (SPK)', 'Berita Acara Pemeriksaan', 'Berita Acara Serah Terima', 'Daftar Hasil Pengadaan Aset'],
    kondisiKhusus: 'Persiapan pengadaan dapat dikecualikan untuk aset bernilai paling banyak Rp10.000.000.',
  },

  penyaluran: {
    label: 'Penerimaan, Penyimpanan & Penyaluran',
    bab: 'BAB V',
    ringkas: 'Menerima aset hasil pengadaan, menyimpan sementara di gudang, dan menyalurkan ke unit sesuai DKA (SPA → SPPA).',
    prinsip: [
      'Penerimaan = tindak lanjut pengadaan; penyimpanan = tindak lanjut penerimaan sebelum disalurkan; penyaluran sesuai DKA.',
      'Mencakup pemeriksaan, serah terima, penyimpanan sementara, pencatatan & penggolongan, dan penyaluran.',
    ],
    tujuan: ['Tatalaksana penerimaan, penyimpanan & penyaluran tertata efektif, akurat, dan tertelusur.'],
    prosedur: [
      'Penerimaan: pemeriksaan aset (berita acara pemeriksaan) → serah terima & pembayaran (BAST) → catat sebagai Daftar Hasil Pengadaan (jenis, pagu, tanggal & nomor SPK/nota, jumlah, sasaran pengguna).',
      'Aset yang dicatat diserahkan ke ruang penyimpanan dengan lampiran daftar hasil pengadaan & BAST.',
      'Penyimpanan: Tata Usaha menerima aset, menyimpan bukti penerimaan, mencatat (buku aset inventaris, buku aset habis pakai, daftar hasil pengadaan, kartu persediaan aset), membuat laporan ketersediaan.',
      'Penyaluran: berdasarkan Surat Permintaan Aset (SPA); TU menerbitkan Surat Perintah Penyaluran Aset (SPPA); catat buku pengeluaran & bukti pengambilan; buat laporan realisasi penyaluran.',
    ],
    wewenang: ['Tata Usaha: memastikan aset diterima tertib, disimpan baik, disalurkan tertelusur; menjaga proses administratif.'],
    dokumen: ['Daftar Hasil Pengadaan', 'Berita Acara Serah Terima', 'Buku Aset Inventaris & Habis Pakai', 'Kartu Persediaan Aset', 'Surat Permintaan Aset (SPA)', 'Surat Perintah Penyaluran Aset (SPPA)', 'Buku Pengeluaran Aset', 'Bukti Pengambilan Aset'],
    kondisiKhusus: null,
  },

  penggunaan: {
    label: 'Penggunaan (Status Penggunaan)',
    bab: 'BAB VI',
    ringkas: 'Penetapan status penggunaan aset kepada unit/pegawai untuk menjalankan tugas & fungsinya, dituangkan dalam berita acara.',
    prinsip: [
      'Penetapan status penggunaan ditetapkan Kepala Sekolah/Mudir sesuai pemohon.',
      'TIDAK dilakukan pada: barang persediaan, konstruksi dalam pengerjaan, dan aset yang sudah ditetapkan lebih lanjut sesuai DKA.',
    ],
    tujuan: ['Menertibkan tata kelola aset & memberi kepastian hak, wewenang, dan tanggung jawab satuan pendidikan.'],
    prosedur: [
      'Guru/pegawai atau Kepala Unit Kerja mengajukan permohonan penggunaan aset pendukung tugasnya.',
      'Kepala Sekolah/Mudir atau PKS Sarpras meneliti permohonan.',
      'Setelah disetujui, Kepala Sekolah membuat berita acara status penggunaan.',
      'Pemegang status penggunaan wajib menatausahakan aset tersebut.',
    ],
    wewenang: ['Kepala Sekolah: meneliti & menyetujui usulan dari unit kerja di bawahnya.'],
    dokumen: ['Surat Pengajuan Status Penggunaan', 'Dokumen Perolehan Aset', 'Berita Acara Status Penggunaan'],
    kondisiKhusus: null,
  },

  inventaris: {
    label: 'Penatausahaan — Pembukuan (KIA/KIR/Buku Inventaris)',
    bab: 'BAB VII',
    ringkas: 'Pencatatan aset menurut penggolongan & kodefikasi ke dalam KIA, KIR, dan Buku Inventaris Aset Satuan Pendidikan.',
    prinsip: [
      'Setiap Kepala Unit Kerja wajib mencatat aset di bawah penggunaannya ke Buku Inventaris menurut penggolongan & kodefikasi.',
      'Dokumen pembukuan: Kartu Inventaris Aset (KIA), Kartu Inventaris Ruangan (KIR), Buku Inventaris Aset.',
    ],
    tujuan: ['Menghimpun pencatatan menjadi Buku Inventaris Aset Satuan Pendidikan, lalu Buku Induk Inventaris di Yayasan.'],
    prosedur: [
      'Urutan pencatatan: isi KIA → isi KIR → isi Buku Inventaris berdasarkan KIA & KIR.',
      'Kepala Sekolah menugaskan Wakasek/PKS/PJ Unit mencatat seluruh aset di bawah status penggunaannya.',
      'Hasil pencatatan (KIA & KIR) dikumpulkan ke Kepala Sekolah → dihimpun menjadi Buku Inventaris Aset Satuan Pendidikan.',
      'Kepala Sekolah melapor ke Pengurus Yayasan Bidang Sarpras → dihimpun menjadi Buku Induk Inventaris Aset.',
    ],
    wewenang: ['Kepala Unit Kerja: mencatat aset; Kepala Sekolah: menghimpun & melapor; Yayasan: buku induk.'],
    dokumen: ['Kartu Inventaris Aset (KIA)', 'Kartu Inventaris Ruangan (KIR)', 'Buku Inventaris Aset Satuan Pendidikan', 'Buku Induk Inventaris Aset'],
    kondisiKhusus: null,
  },

  inventarisasi: {
    label: 'Inventarisasi & Pelaporan',
    bab: 'BAB VII',
    ringkas: 'Sensus/opname aset (min. 1×/5 tahun; persediaan tiap tahun), pemberian label & nilai, Laporan Hasil Inventarisasi, serta laporan semester & tahunan.',
    prinsip: [
      'Inventarisasi aset paling sedikit 1 kali dalam 5 tahun; barang persediaan setiap tahun.',
      'Laporan hasil inventarisasi disampaikan ke Pengurus Yayasan Bidang Sarpras paling lama 3 bulan setelah pelaksanaan.',
    ],
    tujuan: ['Memastikan data aset akurat & tertelusur, memperbarui KIA/KIR, dan menindaklanjuti aset rusak berat/hilang.'],
    prosedur: [
      'Persiapan: bentuk Tim Inventarisasi (disetujui Yayasan), siapkan dokumen sumber, pemetaan lokasi/ruangan & PJ, siapkan KIA/KIR, label sementara & permanen, format Laporan Hasil Inventarisasi (LHI).',
      'Pelaksanaan pendataan: hitung jumlah/volume, teliti kondisi (baik/rusak ringan/rusak berat), identifikasi merk/jenis/ukuran/tanggal perolehan, tempel label sementara, catat di KIA.',
      'Identifikasi: beri nilai, kelompokkan & beri kode sesuai golongan/kodefikasi, pisahkan per kondisi, bandingkan dengan dokumen sumber.',
      'Dokumentasi & pelaporan: Buku Inventaris Pengguna, LHI, Berita Acara Hasil Inventarisasi + surat pernyataan kebenaran + rekapitulasi; disahkan Pengelola Aset & disampaikan ke Ketua Yayasan.',
      'Tindak lanjut: bukukan hasil, perbarui KIA/KIR, tempel label permanen, tindak lanjuti aset rusak berat/hilang.',
      'Pelaporan berkala: Kepala Unit menyusun Laporan Aset Semesteran & Tahunan → dihimpun Kepala Sekolah → disampaikan ke Yayasan sebagai bahan neraca.',
    ],
    wewenang: ['Tim Inventarisasi & Kepala Sekolah melaksanakan; Pengurus Yayasan mengesahkan & menghimpun.'],
    dokumen: ['Rencana Kerja Inventarisasi', 'Label sementara & permanen', 'Laporan Hasil Inventarisasi (LHI) per jenis', 'Berita Acara Hasil Inventarisasi', 'Laporan Aset Semesteran & Tahunan'],
    kondisiKhusus: null,
  },

  pemeliharaan: {
    label: 'Pemeliharaan & Perbaikan',
    bab: 'BAB IX',
    ringkas: 'Menjaga aset tetap baik & layak lewat pemeliharaan terjadwal (logbook), dan perbaikan atas kerusakan yang ditemukan.',
    prinsip: [
      'Seluruh aset (pengadaan/swakelola/hibah/wakaf) dipelihara & diperbaiki agar selalu baik, layak, berdaya guna.',
      'Setiap aset dicatat dalam kartu/ logbook pemeliharaan/perawatan.',
      'Daftar Hasil Pemeliharaan disampaikan ke Pengurus Yayasan Bidang Sarpras.',
    ],
    tujuan: ['Menjaga kondisi & umur pakai aset serta menekan kerusakan.'],
    prosedur: [
      'Pemeliharaan berpedoman pada Daftar Kebutuhan Pemeliharaan Aset.',
      'Susun SOP & jadwal pemeliharaan; laksanakan sesuai jadwal.',
      'Catat hasil ke Logbook Pemeliharaan (nama aset, spesifikasi, tanggal, jenis pemeliharaan, bahan, biaya, pelaksana, tindak lanjut).',
      'Perbaikan: Pengurus Yayasan Bidang Sarpras menerima Laporan Kerusakan & Permintaan Perbaikan; verifikasi & identifikasi (bila perlu sparepart → prosedur pengadaan); tetapkan target; laksanakan (boleh pihak eksternal + BAST perbaikan); catat ke Logbook Perbaikan.',
    ],
    wewenang: ['Kepala Sekolah/PKS Sarpras: pelaksana pemeliharaan; Pengurus Yayasan/Kabid Sarpras: verifikasi & perbaikan.'],
    dokumen: ['Daftar Kebutuhan Pemeliharaan Aset', 'Program & Jadwal Pemeliharaan', 'Logbook Pemeliharaan', 'Logbook Perbaikan'],
    kondisiKhusus: null,
  },

  penghapusan: {
    label: 'Penghapusan & Pemindahtanganan',
    bab: 'BAB X & XI',
    ringkas: 'Menghapus aset dari Buku Inventaris (persetujuan Ketua Yayasan) dan menindaklanjuti dengan penjualan/hibah.',
    prinsip: [
      'Penghapusan = menghapus dari Buku Inventaris Satuan Pendidikan & Buku Induk Inventaris, lewat keputusan Pengurus Yayasan Bidang Sarpras setelah disetujui Ketua Yayasan.',
      'Dasar: rusak berat/force majeure, idle, kebutuhan organisasi, efisiensi lokasi; atau pertimbangan teknis/ekonomis/kehilangan.',
      'Pemindahtanganan (pengalihan kepemilikan) = tindak lanjut penghapusan, setelah persetujuan Ketua Yayasan.',
    ],
    tujuan: ['Menjaga tertib inventaris & mengupayakan pendayagunaan aset yang dihapus (jual/tukar/hibah).'],
    prosedur: [
      'Satuan pendidikan mengajukan permohonan penghapusan (pertimbangan/alasan; data aset: tahun perolehan, kode aset, register, nama, jenis, kondisi, lokasi, nilai; lampiran dokumen kepemilikan).',
      'Pengurus Yayasan Bidang Sarpras meneliti (data/dokumen & on-site bila perlu).',
      'Bila disetujui, Ketua Yayasan menerbitkan Surat Persetujuan Penghapusan → Pengelola Aset menerbitkan SK Penghapusan.',
      'Penjualan: untuk aset berlebih/idle, lebih menguntungkan bila dijual, lelang bila jumlah besar; dilaksanakan Kepala Sekolah setelah persetujuan Yayasan; hasil disetor ke rekening Yayasan.',
      'Hibah: untuk kepentingan sosial/keagamaan/kemanusiaan/pendidikan; bukan barang rahasia/hajat hidup orang banyak & tidak terpakai lagi; setelah persetujuan Yayasan; serah terima dituangkan dalam BAST.',
    ],
    wewenang: ['Kepala Sekolah: mengusulkan & melaksanakan; Pengurus Yayasan: meneliti; Ketua Yayasan: menyetujui.'],
    dokumen: ['Permohonan Penghapusan Aset', 'Surat Persetujuan Penghapusan (Ketua Yayasan)', 'SK Penghapusan Aset', 'Formulir disposal (penjualan/hibah)', 'Berita Acara Serah Terima'],
    kondisiKhusus: null,
  },

  kodefikasi: {
    label: 'Penggolongan & Kodefikasi',
    bab: 'BAB VII',
    ringkas: 'Penggolongan aset ke 6 kelompok & kodefikasi (Kode Aset + Kode Lokasi) sebagai acuan pelabelan — dibuat otomatis oleh sistem.',
    prinsip: [
      'Aset digolongkan ke 6 kelompok: Tanah; Gedung & Bangunan; Jalan, Irigasi & Jaringan; Peralatan & Mesin; Aset Tetap Lainnya; Konstruksi dalam Pengerjaan.',
      'Kode Aset = golongan.bidang.kelompok.subkelompok.subsub + nomor register; Kode Lokasi = kepemilikan.lembaga.unit kerja.ruangan.tahun.',
    ],
    tujuan: ['Menyeragamkan identifikasi & pelabelan aset se-yayasan.'],
    prosedur: [
      'Yayasan membakukan tabel golongan (kebijakan penyusutan) & klasifikasi (Permendagri).',
      'Saat aset dicatat, sistem membuat Kode Aset & Kode Lokasi otomatis dari klasifikasi + ruangan + tahun perolehan (pegawai tidak mengetik kode).',
      'Sarpras/OB menempel label kode aset & kode lokasi (stiker/barcode).',
    ],
    wewenang: ['Yayasan: membakukan golongan & klasifikasi; Sarpras/OB: pelabelan.'],
    dokumen: ['Tabel Golongan & Klasifikasi', 'Label Kode Aset & Kode Lokasi'],
    kondisiKhusus: null,
  },

  // --- Area kebijakan (SOP-only, tanpa form) ---
  pengamanan: {
    label: 'Pengamanan Aset',
    bab: 'BAB VIII',
    ringkas: 'Pengamanan fisik, administrasi, dan hukum atas aset persediaan, tanah, gedung, dan aset tak berwujud.',
    prinsip: [
      'Setiap pengguna aset wajib mengamankan aset dalam status penggunaannya.',
      'Meliputi pengamanan fisik, administrasi, dan hukum. Bukti kepemilikan disimpan tertib oleh Tata Usaha.',
    ],
    prosedur: [
      'Barang persediaan: penempatan sesuai frekuensi, APAR bila perlu, hitung fisik periodik; administrasi (pencatatan, kelengkapan bukti, label kode, BAST); hukum (tuntutan ganti rugi atas kelalaian).',
      'Tanah: pasang tanda letak & papan nama, penjagaan satpam; sertifikatkan Hak Milik atas nama YPI Darussunah.',
      'Gedung/bangunan: pagar, papan nama, APAR, CCTV bila perlu, pemeliharaan rutin; inventarisasi tahunan, sensus 5 tahunan, ajukan IMB bila belum ada.',
      'Aset tak berwujud: batasi kode akses ke pihak berwenang, security system; himpun & tatausahakan BAST/lisensi, ajukan hak cipta/lisensi.',
    ],
    wewenang: ['Pengguna aset & Tata Usaha (penyimpan bukti kepemilikan).'],
    dokumen: ['Dokumen inventarisasi', 'Label kode lokasi & kode aset'],
    kondisiKhusus: null,
  },
  pembinaan: {
    label: 'Pembinaan, Pengawasan & Pengendalian',
    bab: 'BAB XIII',
    ringkas: 'Pembinaan tata kelola aset oleh Yayasan serta pengawasan & pengendalian kinerja pengelolaan aset satuan pendidikan.',
    prinsip: ['Menjamin tertib administrasi & kelancaran pengelolaan aset yang optimal.'],
    prosedur: [
      'Pembinaan: Yayasan menetapkan Juknis Pengelolaan Aset sebagai acuan SOP tiap satuan pendidikan; Pengurus Yayasan membina tata kelola aset.',
      'Pengawasan & pengendalian: Pengurus Yayasan lewat pemantauan, investigasi, penertiban; Kepala Satuan Pendidikan memantau penggunaan/pemanfaatan/pemindahtanganan/pemeliharaan/pengamanan & menetapkan indikator kinerja tata kelola aset; hasil audit/monev disampaikan ke Pengurus Yayasan Bidang Sarpras untuk ditindaklanjuti.',
    ],
    wewenang: ['Pengurus Yayasan & Kepala Satuan Pendidikan.'],
    dokumen: ['Juknis Pengelolaan Aset', 'Laporan audit/monev'],
    kondisiKhusus: null,
  },
  ganti_rugi: {
    label: 'Ganti Rugi & Sanksi',
    bab: 'BAB XII',
    ringkas: 'Penyelesaian kerugian akibat kelalaian/penyalahgunaan lewat tuntutan ganti rugi & sanksi sesuai ketentuan.',
    prinsip: [
      'Kerugian akibat kelalaian, penyalahgunaan, atau pelanggaran hukum atas pengelolaan aset diselesaikan lewat tuntutan ganti rugi sesuai ketentuan yang berlaku.',
      'Pihak yang mengakibatkan kerugian dapat dikenakan sanksi sesuai ketentuan yang berlaku.',
    ],
    prosedur: [],
    wewenang: [],
    dokumen: [],
    kondisiKhusus: null,
  },
}
