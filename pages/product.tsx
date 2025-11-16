// pages/product.tsx
"use client";

import { useEffect, useState, FormEvent } from "react";
import { useAuth, Protect, PricingTable, UserButton } from "@clerk/nextjs";
import DatePicker from "react-datepicker";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import { fetchEventSource } from "@microsoft/fetch-event-source";

// ---------- Types ----------

interface Patient {
  id: string;
  name: string;
  email: string;
  medical_record_number?: string;
  internal_notes?: string;
}

interface ConsultationFormProps {
  getToken: () => Promise<string | null>;
  selectedPatient: Patient | null;
}

// ---------- Patient Management component ----------

interface PatientManagementProps {
  getToken: () => Promise<string | null>;
  patients: Patient[];
  setPatients: (p: Patient[]) => void;
  selectedPatientId: string | null;
  setSelectedPatientId: (id: string | null) => void;
}

function PatientManagement({
  getToken,
  patients,
  setPatients,
  selectedPatientId,
  setSelectedPatientId,
}: PatientManagementProps) {
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newMRN, setNewMRN] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [loading, setLoading] = useState(false);

  // 初次加载病人列表
  useEffect(() => {
    (async () => {
      const jwt = await getToken();
      if (!jwt) return;

      const res = await fetch("/patients", {
        headers: {
          Authorization: `Bearer ${jwt}`,
        },
      });

      if (res.ok) {
        const data = (await res.json()) as Patient[];
        setPatients(data);
      }
    })();
  }, [getToken, setPatients]);

  async function handleAddPatient(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const jwt = await getToken();
      if (!jwt) {
        alert("Authentication required");
        setLoading(false);
        return;
      }

      const res = await fetch("/patients", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${jwt}`,
        },
        body: JSON.stringify({
          name: newName,
          email: newEmail,
          medical_record_number: newMRN,
          internal_notes: internalNotes,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        console.error(text);
        alert("Failed to add patient");
      } else {
        const patient = (await res.json()) as Patient;
        setPatients([...patients, patient]);
        setSelectedPatientId(patient.id);
        setNewName("");
        setNewEmail("");
        setNewMRN("");
        setInternalNotes("");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="bg-gray-900 text-gray-100 rounded-2xl p-8 mb-10 shadow-lg">
      <h2 className="text-2xl font-bold mb-6">Patient Management</h2>

      <div className="grid md:grid-cols-2 gap-8">
        {/* 左侧：选择已有病人 */}
        <div>
          <label className="block text-sm font-medium mb-2">
            Select Existing Patient
          </label>
          <select
            className="w-full px-4 py-2 rounded-lg bg-gray-800 border border-gray-700 focus:ring-2 focus:ring-blue-500"
            value={selectedPatientId || ""}
            onChange={(e) =>
              setSelectedPatientId(e.target.value || null)
            }
          >
            <option value="">— None —</option>
            {patients.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.email})
              </option>
            ))}
          </select>
        </div>

        {/* 右侧：新增病人 */}
        <form onSubmit={handleAddPatient} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">
              New Patient Name
            </label>
            <input
              type="text"
              required
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full px-4 py-2 rounded-lg bg-gray-800 border border-gray-700 focus:ring-2 focus:ring-blue-500"
              placeholder="e.g. John Doe"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">
              Email
            </label>
            <input
              type="email"
              required
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              className="w-full px-4 py-2 rounded-lg bg-gray-800 border border-gray-700 focus:ring-2 focus:ring-blue-500"
              placeholder="patient@example.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">
              Medical Record Number
            </label>
            <input
              type="text"
              value={newMRN}
              onChange={(e) => setNewMRN(e.target.value)}
              className="w-full px-4 py-2 rounded-lg bg-gray-800 border border-gray-700 focus:ring-2 focus:ring-blue-500"
              placeholder="Optional MRN / ID"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">
              Internal notes (optional)
            </label>
            <textarea
              value={internalNotes}
              onChange={(e) => setInternalNotes(e.target.value)}
              className="w-full px-4 py-2 rounded-lg bg-gray-800 border border-gray-700 focus:ring-2 focus:ring-blue-500"
              rows={3}
              placeholder="Internal notes for this patient..."
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="mt-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-semibold py-2 px-6 rounded-lg"
          >
            {loading ? "Adding..." : "Add Patient"}
          </button>
        </form>
      </div>
    </section>
  );
}

// ---------- Consultation Form (uses selected patient) ----------

function ConsultationForm({
  getToken,
  selectedPatient,
}: ConsultationFormProps) {
  const [patientName, setPatientName] = useState("");
  const [visitDate, setVisitDate] = useState<Date | null>(new Date());
  const [notes, setNotes] = useState("");

  const [output, setOutput] = useState("");
  const [loading, setLoading] = useState(false);

  // 如果选中了病人，默认填入名字
  useEffect(() => {
    if (selectedPatient) {
      setPatientName(selectedPatient.name);
    }
  }, [selectedPatient]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setOutput("");
    setLoading(true);

    const jwt = await getToken();
    if (!jwt) {
      setOutput("Authentication required");
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    let buffer = "";

    await fetchEventSource("/api", {
      signal: controller.signal,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${jwt}`,
      },
      body: JSON.stringify({
        patient_id: selectedPatient ? selectedPatient.id : null,
        patient_name: patientName,
        date_of_visit: visitDate?.toISOString().slice(0, 10),
        notes,
      }),
      onmessage(ev) {
        buffer += ev.data;
        setOutput(buffer);
      },
      onclose() {
        setLoading(false);
      },
      onerror(err) {
        console.error("SSE error:", err);
        controller.abort();
        setLoading(false);
      },
    });
  }

  return (
    <div className="container mx-auto px-4 py-12 max-w-3xl">
      <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-100 mb-2">
        Consultation Notes
      </h1>
      <p className="text-sm text-gray-500 mb-6">
        {selectedPatient
          ? `Saving summaries under patient: ${selectedPatient.name} (${selectedPatient.email})`
          : "No patient selected — summaries will not be attached to a patient record."}
      </p>

      <form
        onSubmit={handleSubmit}
        className="space-y-6 bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8"
      >
        <div className="space-y-2">
          <label
            htmlFor="patient"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Patient Name
          </label>
          <input
            id="patient"
            type="text"
            required
            value={patientName}
            onChange={(e) => setPatientName(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
            placeholder="Enter patient's full name"
          />
        </div>

        <div className="space-y-2">
          <label
            htmlFor="date"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Date of Visit
          </label>
          <DatePicker
            id="date"
            selected={visitDate}
            onChange={(d: Date | null) => setVisitDate(d)}
            dateFormat="yyyy-MM-dd"
            placeholderText="Select date"
            required
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
          />
        </div>

        <div className="space-y-2">
          <label
            htmlFor="notes"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Consultation Notes
          </label>
          <textarea
            id="notes"
            required
            rows={8}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
            placeholder="Enter detailed consultation notes..."
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold py-3 px-6 rounded-lg transition-colors duration-200"
        >
          {loading ? "Generating Summary..." : "Generate & Save Summary"}
        </button>
      </form>

      {output && (
        <section className="mt-8 bg-gray-50 dark:bg-gray-800 rounded-xl shadow-lg p-8">
          <div className="markdown-content prose prose-blue dark:prose-invert max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>
              {output}
            </ReactMarkdown>
          </div>
        </section>
      )}
    </div>
  );
}

// ---------- Page component with Protect ----------

export default function Product() {
  const { getToken } = useAuth();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(
    null
  );

  const selectedPatient =
    patients.find((p) => p.id === selectedPatientId) || null;

  return (
    <main className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
      {/* User Menu in Top Right */}
      <div className="absolute top-4 right-4">
        <UserButton showName={true} />
      </div>

      {/* Subscription Protection */}
      <Protect
        plan="premium_subscription"
        fallback={
          <div className="container mx-auto px-4 py-12">
            <header className="text-center mb-12">
              <h1 className="text-5xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent mb-4">
                Healthcare Professional Plan
              </h1>
              <p className="text-gray-600 dark:text-gray-400 text-lg mb-8">
                Streamline your patient consultations with AI-powered summaries
              </p>
            </header>
            <div className="max-w-4xl mx-auto">
              <PricingTable />
            </div>
          </div>
        }
      >
        <div className="container mx-auto px-4 py-16 max-w-6xl">
          <PatientManagement
            getToken={getToken}
            patients={patients}
            setPatients={setPatients}
            selectedPatientId={selectedPatientId}
            setSelectedPatientId={setSelectedPatientId}
          />
          <ConsultationForm
            getToken={getToken}
            selectedPatient={selectedPatient}
          />
        </div>
      </Protect>
    </main>
  );
}
