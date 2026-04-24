"use client";

import { useState, useMemo } from "react";
import { Plus, Search, RefreshCw, Trash2, Pencil, Users } from "lucide-react";
import { useCurrentUser } from "@/app/admin/_context/UserContext";
import { UNITS } from "@/lib/roles";
import { usePetugas } from "./_hooks/usePetugas";
import type { Petugas } from "./_hooks/usePetugas";
import PetugasFormModal from "./_components/PetugasFormModal";

const GROUPS = ["", "INSPEKTOR", "PERABASAN", "YANGU", "HARJAR", "HARGAR", "PDKB", "K3"];

const STATUS_CLS: Record<string, string> = {
  aktif: "bg-green-50 text-green-700",
  "non-aktif": "bg-gray-100 text-gray-500",
};

export default function PetugasPage() {
  const currentUser = useCurrentUser();
  const isUP3 = currentUser?.role === "UP3";
  const isAdmin = currentUser?.role === "admin";

  if (!isUP3 && !isAdmin) {
    return (
      <div className="flex items-center justify-center h-64 text-[#5D6D7E]">
        Akses ditolak. Halaman ini hanya untuk UP3 dan Admin ULP.
      </div>
    );
  }

  const [filterUlp, setFilterUlp] = useState(isUP3 ? "" : (currentUser?.unit ?? ""));
  const [filterGroup, setFilterGroup] = useState("");
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Petugas | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Petugas | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const { data, loading, error, refresh, addPetugas, updatePetugas, deletePetugas } =
    usePetugas(filterUlp || undefined);

  const filtered = useMemo(() => {
    let rows = data;
    if (filterGroup) rows = rows.filter((p) => p.group_name === filterGroup);
    const q = search.toLowerCase();
    if (q) rows = rows.filter(
      (p) =>
        p.nama.toLowerCase().includes(q) ||
        (p.phone ?? "").includes(q) ||
        (p.email ?? "").toLowerCase().includes(q)
    );
    return rows;
  }, [data, filterGroup, search]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    setDeleteError(null);
    const err = await deletePetugas(deleteTarget.id);
    setDeleteLoading(false);
    if (err) { setDeleteError(err); return; }
    setDeleteTarget(null);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-linear-to-r from-[#004D40] to-[#00897B] text-white rounded-xl p-6">
        <div className="flex items-center gap-3">
          <Users size={28} />
          <div>
            <h1 className="text-xl font-bold">Manajemen Petugas</h1>
            <p className="text-white/70 text-sm mt-0.5">
              Kelola data petugas lapangan {isUP3 ? "semua ULP" : `ULP ${currentUser?.unit}`}
            </p>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="bg-white rounded-xl shadow-sm border border-[#E2E8F0] p-4">
        <div className="flex flex-wrap items-center gap-3">
          {isUP3 && (
            <select
              value={filterUlp}
              onChange={(e) => setFilterUlp(e.target.value)}
              className="border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm text-[#1B2631] focus:outline-none focus:border-[#00897B] focus:ring-2 focus:ring-[#00897B]/20"
            >
              <option value="">Semua ULP</option>
              {UNITS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
            </select>
          )}

          <select
            value={filterGroup}
            onChange={(e) => setFilterGroup(e.target.value)}
            className="border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm text-[#1B2631] focus:outline-none focus:border-[#00897B] focus:ring-2 focus:ring-[#00897B]/20"
          >
            {GROUPS.map((g) => (
              <option key={g} value={g}>{g || "Semua Group"}</option>
            ))}
          </select>

          <div className="relative flex-1 min-w-50">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5D6D7E]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama, HP, atau email..."
              className="w-full border border-[#E2E8F0] rounded-lg pl-8 pr-3 py-2 text-sm text-[#1B2631] placeholder:text-[#9CA3AF] focus:outline-none focus:border-[#00897B] focus:ring-2 focus:ring-[#00897B]/20"
            />
          </div>

          <button
            onClick={refresh}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-[#5D6D7E] border border-[#E2E8F0] rounded-lg hover:bg-[#F4F6F8]"
          >
            <RefreshCw size={14} />
            Refresh
          </button>

          <button
            onClick={() => setAddOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2 text-sm bg-linear-to-r from-[#004D40] to-[#00897B] text-white rounded-lg font-medium hover:opacity-90"
          >
            <Plus size={14} />
            Tambah Petugas
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-[#E2E8F0] overflow-hidden">
        {error && (
          <div className="p-4 text-sm text-red-600 bg-red-50 border-b border-[#E2E8F0]">{error}</div>
        )}

        {loading ? (
          <div className="flex items-center justify-center h-40 gap-2 text-[#5D6D7E]">
            <div className="w-5 h-5 border-4 border-[#E2E8F0] border-t-[#00897B] rounded-full animate-spin" />
            Memuat data...
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#E0F2F1] text-[#00695C] font-semibold text-xs uppercase tracking-wide">
                  <th className="px-4 py-3 text-left">Nama</th>
                  <th className="px-4 py-3 text-left">Group</th>
                  <th className="px-4 py-3 text-left">ULP</th>
                  <th className="px-4 py-3 text-left">No. HP</th>
                  <th className="px-4 py-3 text-left">Email</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-[#5D6D7E]">
                      Tidak ada petugas ditemukan
                    </td>
                  </tr>
                ) : (
                  filtered.map((p) => (
                    <tr key={p.id} className="hover:bg-[#F4F6F8]">
                      <td className="px-4 py-3 font-medium text-[#1B2631]">{p.nama}</td>
                      <td className="px-4 py-3">
                        <span className="bg-[#E0F2F1] text-[#00695C] text-xs font-semibold px-2 py-0.5 rounded">
                          {p.group_name}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[#5D6D7E]">{p.ulp}</td>
                      <td className="px-4 py-3 text-[#5D6D7E]">{p.phone || "—"}</td>
                      <td className="px-4 py-3 text-[#5D6D7E]">{p.email || "—"}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded ${STATUS_CLS[p.status] ?? "bg-gray-100 text-gray-500"}`}>
                          {p.status === "aktif" ? "Aktif" : "Non-aktif"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => setEditTarget(p)}
                            className="p-1.5 text-[#5D6D7E] hover:text-[#00897B] hover:bg-[#E0F2F1] rounded"
                            title="Edit"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={() => setDeleteTarget(p)}
                            className="p-1.5 text-[#5D6D7E] hover:text-red-600 hover:bg-red-50 rounded"
                            title="Hapus"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {!loading && (
          <div className="px-4 py-2 border-t border-[#E2E8F0] text-xs text-[#5D6D7E]">
            {filtered.length} petugas{filtered.length !== data.length ? ` dari ${data.length}` : ""}
          </div>
        )}
      </div>

      {/* Add Modal */}
      {addOpen && (
        <PetugasFormModal
          fixedUlp={isAdmin ? (currentUser?.unit ?? undefined) : undefined}
          onClose={() => setAddOpen(false)}
          onSave={addPetugas}
        />
      )}

      {/* Edit Modal */}
      {editTarget && (
        <PetugasFormModal
          petugas={editTarget}
          fixedUlp={isAdmin ? (currentUser?.unit ?? undefined) : undefined}
          onClose={() => setEditTarget(null)}
          onSave={(input) => updatePetugas(editTarget.id, input)}
        />
      )}

      {/* Delete Confirm */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <h3 className="font-bold text-[#1B2631]">Hapus Petugas</h3>
            <p className="text-sm text-[#5D6D7E]">
              Yakin ingin menghapus <strong>{deleteTarget.nama}</strong>?
              Data ini tidak bisa dipulihkan.
            </p>
            {deleteError && (
              <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{deleteError}</p>
            )}
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { setDeleteTarget(null); setDeleteError(null); }}
                className="px-4 py-2 text-sm text-[#5D6D7E] border border-[#E2E8F0] rounded-lg hover:bg-[#F4F6F8]"
              >
                Batal
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteLoading}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 disabled:opacity-50"
              >
                {deleteLoading ? "Menghapus..." : "Hapus"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
