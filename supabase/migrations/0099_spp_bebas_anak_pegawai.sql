-- 0099: Pembebasan SPP otomatis untuk "anak pegawai".
--
-- Permintaan: ketika biodata siswa diubah menjadi anak pegawai (ditautkan ke
-- pegawai via siswa.employee_ortu_id), tagihan SPP yang BELUM dibayar pada
-- TAHUN AJARAN AKTIF otomatis dibebaskan (net Rp0), dengan catatan. Tagihan
-- yang sudah dibayar sebagian/lunas TIDAK disentuh.
--
-- Catatan desain:
-- * Hanya baris status 'belum_bayar' (belum ada pembayaran) yang dibebaskan —
--   agar tidak mengganggu tagihan yang sudah ada pembayarannya.
-- * Tagihan BARU yang digenerate setelah siswa jadi anak pegawai tetap
--   mengikuti mekanisme Keringanan (buat kebijakan "Anak pegawai" SPP 100%
--   bila ingin tagihan baru otomatis nol juga).
-- * Guard pada fn_notify_spp_lunas: pembebasan (net 0 via potongan) TIDAK
--   memicu email "pembayaran lunas", karena bukan pembayaran nyata.

-- 1. Fungsi + trigger pembebasan pada perubahan tautan orang tua pegawai.
create or replace function public.spp_bebas_anak_pegawai()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ta uuid;
begin
  if new.employee_ortu_id is not null
     and new.employee_ortu_id is distinct from old.employee_ortu_id then
    select id into v_ta from public.tahun_ajaran where status = 'aktif' limit 1;
    if v_ta is not null then
      update public.spp_tagihan t
      set nominal_bruto = coalesce(t.nominal_bruto, t.nominal_tagihan),
          potongan = coalesce(t.nominal_bruto, t.nominal_tagihan),
          potongan_catatan = 'Anak pegawai — dibebaskan otomatis',
          nominal_tagihan = 0,
          status = 'lunas'
      where t.siswa_id = new.id
        and t.tahun_ajaran_id = v_ta
        and t.status = 'belum_bayar';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_spp_bebas_anak_pegawai on public.siswa;
create trigger trg_spp_bebas_anak_pegawai
  after update of employee_ortu_id on public.siswa
  for each row execute function public.spp_bebas_anak_pegawai();

-- 2. Jangan kirim email "SPP lunas" untuk tagihan yang DIBEBASKAN (bukan bayar).
--    (Mempertahankan logika asli fn_notify_spp_lunas, menambah guard di awal.)
create or replace function public.fn_notify_spp_lunas()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_nama text;
  v_nama_bulan text[] := array['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
begin
  if new.status is distinct from old.status and new.status = 'lunas' then
    -- Tagihan dibebaskan (net 0 lewat potongan) bukan pembayaran nyata → lewati.
    if coalesce(new.nominal_tagihan, 0) = 0 and coalesce(new.potongan, 0) > 0 then
      return new;
    end if;
    select nama_lengkap, email_ortu into v_nama, v_email from public.siswa where id = new.siswa_id;
    if v_email is null or v_email = '' then
      return new;
    end if;
    perform public.fn_send_email(
      v_email,
      format('Konfirmasi Pembayaran SPP — %s %s', v_nama_bulan[new.bulan], new.tahun),
      format('<p>Pembayaran SPP atas nama <b>%s</b> untuk periode <b>%s %s</b> sebesar %s telah LUNAS.</p><p>Terima kasih.</p>',
        coalesce(v_nama, '-'), v_nama_bulan[new.bulan], new.tahun, to_char(new.nominal_tagihan, 'FM999G999G999'))
    );
  end if;
  return new;
end;
$$;

notify pgrst, 'reload schema';
