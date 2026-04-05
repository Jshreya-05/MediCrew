// About.jsx – Tailwind Version (Clean Info + Dropdowns)

import { useState } from "react";

/* ─── Accordion Component ─── */
function AccSection({ title, subtitle, icon, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-gray-50 transition"
      >
        <div className="w-10 h-10 flex items-center justify-center rounded-lg bg-teal-100 text-teal-600 text-lg">
          {icon}
        </div>

        <div className="flex-1">
          <div className="font-semibold text-gray-800">{title}</div>
          <div className="text-xs text-gray-500">{subtitle}</div>
        </div>

        <div className={`transition-transform ${open ? "rotate-180" : ""}`}>
          ⌄
        </div>
      </button>

      {open && (
        <div className="px-5 pb-5 border-t border-gray-200 animate-fadeIn">
          {children}
        </div>
      )}
    </div>
  );
}

/* ─── Main Component ─── */
export default function About() {
  return (
    <div className="min-h-screen bg-gray-50 text-gray-800 px-4 md:px-10 py-10">

      {/* ─── Hero ─── */}
      <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-10 items-start mb-10">

        <div>
          <span className="inline-block bg-teal-100 text-teal-700 text-xs px-3 py-1 rounded-full mb-4">
            AI Clinical Research Tool
          </span>

          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 leading-tight mb-4">
            AI-Assisted Cardiac Rhythm Classification
          </h1>

          <p className="text-gray-600 leading-relaxed mb-6">
            A clinical decision support system using deep learning to analyze ECG signals
            and detect arrhythmias like AFib, VFib, and Normal Sinus Rhythm.
          </p>

          <div className="flex flex-wrap gap-4 text-sm">
            <span className="bg-white border px-3 py-1 rounded">CNN Model</span>
            <span className="bg-white border px-3 py-1 rounded">MIT-BIH Dataset</span>
            <span className="bg-white border px-3 py-1 rounded">Real-time Analysis</span>
          </div>
        </div>

        {/* Stats */}
        <div className="bg-gray-900 text-white rounded-2xl p-6 shadow-lg">
          <div className="text-xs uppercase text-gray-400 mb-4">
            Performance
          </div>

          <div className="space-y-4">
            <div>
              <div className="text-2xl font-bold">97%</div>
              <div className="text-xs text-gray-400">Accuracy</div>
            </div>

            <div>
              <div className="text-2xl font-bold">94%</div>
              <div className="text-xs text-gray-400">AFib Sensitivity</div>
            </div>

            <div>
              <div className="text-2xl font-bold">98%</div>
              <div className="text-xs text-gray-400">Specificity</div>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Main Layout ─── */}
      <div className="max-w-6xl mx-auto grid md:grid-cols-3 gap-6">

        {/* LEFT (Accordion) */}
        <div className="md:col-span-2 space-y-4">

          <AccSection
            icon="📊"
            title="Dataset & Training"
            subtitle="MIT-BIH · Data · CNN"
            defaultOpen
          >
            <p className="text-sm text-gray-600 mt-3">
              Model trained on MIT-BIH Arrhythmia dataset with ~110,000 labeled beats.
            </p>

            <div className="grid grid-cols-2 gap-3 mt-4 text-sm">
              <div className="bg-gray-100 p-3 rounded">48 Recordings</div>
              <div className="bg-gray-100 p-3 rounded">360 Hz</div>
              <div className="bg-gray-100 p-3 rounded">187 Samples</div>
              <div className="bg-gray-100 p-3 rounded">~110k Beats</div>
            </div>
          </AccSection>

          <AccSection
            icon="🔬"
            title="Signal Processing"
            subtitle="Filtering · R-Peaks · CNN"
          >
            <ul className="text-sm text-gray-600 mt-3 space-y-2">
              <li>• Bandpass filtering (0.5–40Hz)</li>
              <li>• R-peak detection</li>
              <li>• Beat segmentation</li>
              <li>• CNN classification</li>
            </ul>
          </AccSection>

          <AccSection
            icon="🖼️"
            title="ECG Image Analysis"
            subtitle="Image → Signal"
          >
            <p className="text-sm text-gray-600 mt-3">
              Converts ECG images into digital signals using image processing.
            </p>
          </AccSection>

          <AccSection
            icon="⚠️"
            title="Disclaimer"
            subtitle="Research use only"
          >
            <p className="text-sm text-red-600 mt-3">
              This system is not medically approved. Always consult a doctor.
            </p>
          </AccSection>

        </div>

        {/* RIGHT (Sidebar) */}
        <div className="space-y-4">

          <div className="bg-white border rounded-xl p-4 shadow-sm">
            <div className="font-semibold mb-3">System Info</div>

            <div className="text-sm space-y-2 text-gray-600">
              <div className="flex justify-between">
                <span>Model</span>
                <span>1D CNN</span>
              </div>
              <div className="flex justify-between">
                <span>Input</span>
                <span>187 samples</span>
              </div>
              <div className="flex justify-between">
                <span>Speed</span>
                <span>&lt;200ms</span>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-gray-900 to-gray-700 text-white rounded-xl p-5 text-center">
            <div className="font-semibold mb-2">Start Using</div>
            <p className="text-xs text-gray-300 mb-3">
              Upload ECG and get instant AI results
            </p>

            <button className="bg-teal-500 px-4 py-2 rounded text-sm font-medium hover:bg-teal-600 transition">
              Try Now
            </button>
          </div>

        </div>

      </div>
    </div>
  );
}