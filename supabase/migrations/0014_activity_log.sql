-- Log audit sederhana (Roadmap B Integrasi #11): mencatat siapa mengubah
-- apa dan kapan untuk data payroll dan komponen yang memengaruhinya —
-- golongan pegawai, tugas tambahan, indeks kinerja, dan slip gaji itu
-- sendiri — supaya perubahan yang berdampak ke gaji bisa ditelusuri.
-- Non-destruktif: tabel baru + trigger baru, tidak mengubah tabel yang ada.
--
-- CATATAN: migrasi ini mengasumsikan tabel employee_tugas_tambahan
-- (kolom: employee_id, tugas_tambahan_id) dan performance_index (kolom:
-- employee_id, periode_mulai, periode_selesai, skor, kategori,
-- indeks_kinerja) sudah ada di database — sesuai yang dipakai kode
-- aplikasi (src/pages/payroll/PayrollRunDetail.jsx,
-- src/pages/performance/PerformanceList.jsx). Jalankan migrasi ini
-- SETELAH kedua tabel tersebut ada.

create table if not exists public.activity_log (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  row_id uuid,
  employee_id uuid references public.employees(id) on delete set null,
  changed_by uuid,
  changed_by_email text,
  changed_at timestamptz not null default now(),
  old_data jsonb,
  new_data jsonb
);

create index if not exists activity_log_employee_id_idx on public.activity_log (employee_id);
create index if not exists activity_log_changed_at_idx on public.activity_log (changed_at desc);
create index if not exists activity_log_table_name_idx on public.activity_log (table_name);

alter table public.activity_log enable row level security;

-- Hanya Admin Yayasan/HR yang bisa melihat log (halaman viewer khusus admin).
drop policy if exists activity_log_select on public.activity_log;
create policy activity_log_select on public.activity_log for select using (public.is_yayasan_admin());

-- Fungsi trigger generik: dipakai oleh semua tabel yang diaudit di bawah.
-- security definer supaya insert ke activity_log tidak terhalang RLS
-- tabel activity_log itu sendiri (yang sengaja dibatasi hanya select untuk
-- admin) — pola yang sama dengan fungsi helper RLS lain di proyek ini
-- (is_yayasan_admin, has_school_access, dst.).
create or replace function public.fn_log_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_employee_id uuid;
  v_email text;
begin
  select email into v_email from auth.users where id = auth.uid();

  if tg_op = 'DELETE' then
    v_employee_id := case
      when tg_table_name = 'employees' then old.id
      else old.employee_id
    end;
    insert into public.activity_log (table_name, action, row_id, employee_id, changed_by, changed_by_email, old_data)
    values (tg_table_name, tg_op, old.id, v_employee_id, auth.uid(), v_email, to_jsonb(old));
    return old;
  else
    v_employee_id := case
      when tg_table_name = 'employees' then new.id
      else new.employee_id
    end;
    insert into public.activity_log (table_name, action, row_id, employee_id, changed_by, changed_by_email, old_data, new_data)
    values (
      tg_table_name, tg_op, new.id, v_employee_id, auth.uid(), v_email,
      case when tg_op = 'UPDATE' then to_jsonb(old) else null end,
      to_jsonb(new)
    );
    return new;
  end if;
end;
$$;

-- payroll_details: proses awal ("Proses Pegawai Aktif") dan setiap
-- perubahan (Hitung Ulang, Hitung Ulang Semua, ubah honor/potongan).
drop trigger if exists trg_log_payroll_details on public.payroll_details;
create trigger trg_log_payroll_details
  after insert or update on public.payroll_details
  for each row execute function public.fn_log_activity();

-- employees: HANYA perubahan Golongan (kolom paling berdampak ke gaji) —
-- bukan seluruh kolom biodata, supaya log tidak penuh perubahan tak
-- relevan (alamat, no. HP, dll.).
drop trigger if exists trg_log_employees_golongan on public.employees;
create trigger trg_log_employees_golongan
  after update of golongan on public.employees
  for each row
  when (old.golongan is distinct from new.golongan)
  execute function public.fn_log_activity();

-- employee_tugas_tambahan: penambahan/pencabutan tugas tambahan (memengaruhi
-- Tunjangan Fungsional).
drop trigger if exists trg_log_tugas_tambahan on public.employee_tugas_tambahan;
create trigger trg_log_tugas_tambahan
  after insert or delete on public.employee_tugas_tambahan
  for each row execute function public.fn_log_activity();

-- performance_index: perubahan Indeks Kinerja yang dipakai menghitung
-- Tunjangan Remunerasi.
drop trigger if exists trg_log_performance_index on public.performance_index;
create trigger trg_log_performance_index
  after insert or update on public.performance_index
  for each row execute function public.fn_log_activity();
