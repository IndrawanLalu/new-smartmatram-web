"use client";

import { useEffect, useState } from "react";
import { useCurrentUser } from "@/app/admin/_context/UserContext";
import { canSeeAllUnits } from "@/lib/roles";
import { usePetaGardu } from "./_hooks/usePetaGardu";
import { useDrawing } from "./_hooks/useDrawing";
import { useMeasure } from "./_hooks/useMeasure";
import { useMapSelection } from "./_hooks/useMapSelection";
import { useTiangReferensi } from "./_hooks/useTiangReferensi";
import PetaGarduCanvas from "./_components/PetaGarduCanvas";
import LayerPanel from "./_components/_LayerPanel";
import AttributePanel from "./_components/_AttributePanel";
import FeatureForm from "./_components/_FeatureForm";
import type { FeatureType, Gardu, Jalur, Tiang } from "./_hooks/types";

export default function PetaGarduPage() {
  const user = useCurrentUser();
  const peta = usePetaGardu(user);
  const drawing = useDrawing();
  const measure = useMeasure();
  const selection = useMapSelection();
  const tiangRef = useTiangReferensi(peta.feederOptions);

  const [showForm, setShowForm] = useState(false);
  const [formMode, setFormMode] = useState<"add" | "edit">("add");
  const [formType, setFormType] = useState<FeatureType>("tiang");
  const [formInitial, setFormInitial] = useState<Gardu | Jalur | Tiang | null>(null);
  const [formPoints, setFormPoints] = useState<[number, number][]>([]);
  const [formLatLng, setFormLatLng] = useState<[number, number] | null>(null);

  // Fetch on mount
  useEffect(() => {
    peta.refresh();
  }, [peta.refresh]);

  // Handle map click routing
  const handleMapClick = (latlng: [number, number]) => {
    const { activeTool } = drawing;
    if (activeTool === "addTiang") {
      setFormType("tiang");
      setFormMode("add");
      setFormInitial(null);
      setFormLatLng(latlng);
      setFormPoints([]);
      setShowForm(true);
      drawing.setActiveTool("select");
    } else if (activeTool === "drawJalur") {
      drawing.addPoint(latlng);
    } else if (activeTool === "measure") {
      measure.addMeasurePoint(latlng);
    }
  };

  const handleFinishDrawJalur = () => {
    const pts = drawing.finishDrawing();
    if (pts.length < 2) return;
    setFormType("jalur");
    setFormMode("add");
    setFormInitial(null);
    setFormPoints(pts);
    setFormLatLng(null);
    setShowForm(true);
    drawing.setActiveTool("select");
  };

  const handleEditFeature = () => {
    if (!selection.selectedFeature) return;
    setFormType(selection.selectedFeature.type);
    setFormMode("edit");
    setFormInitial(selection.selectedFeature.data);
    setFormPoints(
      selection.selectedFeature.type === "jalur"
        ? (selection.selectedFeature.data as Jalur).koordinat
        : []
    );
    setFormLatLng(null);
    setShowForm(true);
  };

  const handleFormSaved = () => {
    setShowForm(false);
    selection.clearSelection();
  };

  const isUP3 = user ? canSeeAllUnits(user.role) : false;

  return (
    <div className="flex flex-col h-[calc(100vh-96px)] -m-6">
      {/* Status bar */}
      <div className="flex items-center gap-3 px-4 py-1.5 bg-[#0a1628] border-b border-[#1e3552] shrink-0">
        <span className="text-[#5eead4] text-xs font-semibold tracking-wide uppercase">
          Peta Aset Jaringan
        </span>
        <span className="text-gray-600 text-xs">·</span>
        <span className="text-gray-400 text-xs font-mono">
          {peta.stats.garduCount} gardu
        </span>
        <span className="text-gray-600 text-xs">·</span>
        <span className="text-gray-400 text-xs font-mono">
          {peta.stats.jalurCount} jalur ({peta.stats.jalurKm.toFixed(1)} km)
        </span>
        <span className="text-gray-600 text-xs">·</span>
        <span className="text-gray-400 text-xs font-mono">
          {peta.stats.tiangCount} tiang
        </span>
        {peta.loading && (
          <div className="ml-2 w-3 h-3 border-2 border-gray-700 border-t-[#00897B] rounded-full animate-spin" />
        )}
        {peta.error && (
          <span className="text-red-400 text-xs ml-auto">{peta.error}</span>
        )}
      </div>

      {/* Main layout */}
      <div className="flex flex-1 min-h-0">
        {/* Left panel */}
        <LayerPanel
          filter={peta.filter}
          setFilter={peta.setFilter}
          stats={peta.stats}
          feederOptions={peta.feederOptions}
          isUP3={isUP3}
          garduList={peta.garduList}
          jalurList={peta.jalurList}
          tiangList={peta.tiangList}
          tiangRefCount={tiangRef.tiangRef.length}
          tiangRefLoading={tiangRef.loading}
          tiangRefError={tiangRef.error}
          tiangRefSelectedFeeders={tiangRef.selectedFeeders}
          toggleTiangFeeder={tiangRef.toggleFeeder}
          showTiangRef={tiangRef.showLayer}
          setShowTiangRef={tiangRef.setShowLayer}
          snapEnabled={tiangRef.snapEnabled}
          setSnapEnabled={tiangRef.setSnapEnabled}
          tiangSheetNames={tiangRef.sheetNames}
          tiangSheetNamesLoading={tiangRef.sheetNamesLoading}
        />

        {/* Map */}
        <div className="flex-1 min-w-0 relative">
          <PetaGarduCanvas
            filteredGardu={peta.filteredGardu}
            filteredJalur={peta.filteredJalur}
            filteredTiang={peta.filteredTiang}
            selectedFeature={selection.selectedFeature}
            onFeatureSelect={selection.selectFeature}
            activeTool={drawing.activeTool}
            setActiveTool={drawing.setActiveTool}
            currentPoints={drawing.currentPoints}
            undoLastPoint={drawing.undoLastPoint}
            onFinishDrawJalur={handleFinishDrawJalur}
            measurePoints={measure.measurePoints}
            totalDistanceM={measure.totalDistanceM}
            clearMeasure={measure.clearMeasure}
            onMapClick={handleMapClick}
            mapRef={selection.mapRef}
            tiangRef={tiangRef.tiangRef}
            showTiangRef={tiangRef.showLayer}
            snapEnabled={tiangRef.snapEnabled}
          />
        </div>

        {/* Right panel — attribute */}
        {selection.selectedFeature && (
          <AttributePanel
            feature={selection.selectedFeature}
            jalurList={peta.jalurList}
            onClose={selection.clearSelection}
            onZoomTo={selection.zoomToSelected}
            onEdit={handleEditFeature}
            onDeleteJalur={peta.deleteJalur}
            onDeleteTiang={peta.deleteTiang}
          />
        )}
      </div>

      {/* Feature form drawer */}
      {showForm && (
        <FeatureForm
          mode={formMode}
          featureType={formType}
          initialData={formInitial}
          initialLatLng={formLatLng}
          drawnPoints={formPoints}
          jalurList={peta.jalurList}
          userUnit={user?.unit ?? null}
          isUP3={isUP3}
          onClose={() => setShowForm(false)}
          onSaved={handleFormSaved}
          insertJalur={peta.insertJalur}
          updateJalur={peta.updateJalur}
          insertTiang={peta.insertTiang}
          updateTiang={peta.updateTiang}
        />
      )}

    </div>
  );
}
