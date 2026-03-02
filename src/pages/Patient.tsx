import { useEffect, useState } from "react";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { getPatientById, listPatients, Patient, upsertPatient } from "@/lib/db";
import { Loader2, Search, Save } from "lucide-react";

const emptyPatient: Patient = {
  patientId: "",
  fullName: "",
  age: undefined,
  gender: "",
  phone: "",
  address: "",
  medicalHistory: "",
  allergies: "",
  diagnosisHistory: "",
};

export default function PatientPage() {
  const [patient, setPatient] = useState<Patient>(emptyPatient);
  const [query, setQuery] = useState("");
  const [patients, setPatients] = useState<Patient[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingPatient, setIsLoadingPatient] = useState(false);
  const [isListLoading, setIsListLoading] = useState(false);
  const { toast } = useToast();

  const loadPatients = async (search = "") => {
    setIsListLoading(true);
    try {
      const rows = await listPatients(search);
      setPatients(rows);
    } catch {
      toast({
        variant: "destructive",
        title: "Patient list unavailable",
        description: "Unable to load patient records right now.",
      });
    } finally {
      setIsListLoading(false);
    }
  };

  useEffect(() => {
    loadPatients();
  }, []);

  const handleFetchPatient = async () => {
    const patientId = patient.patientId?.trim();
    if (!patientId) return;
    setIsLoadingPatient(true);
    try {
      const existing = await getPatientById(patientId);
      if (existing) {
        setPatient({
          patientId: existing.patientId,
          fullName: existing.fullName || "",
          age: existing.age,
          gender: existing.gender || "",
          phone: existing.phone || "",
          address: existing.address || "",
          medicalHistory: existing.medicalHistory || "",
          allergies: existing.allergies || "",
          diagnosisHistory: existing.diagnosisHistory || "",
        });
        toast({
          title: "Patient loaded",
          description: `Existing details loaded for ${patientId}.`,
        });
      } else {
        toast({
          title: "New patient",
          description: `No record found for ${patientId}. Enter details and save.`,
        });
      }
    } catch {
      toast({
        variant: "destructive",
        title: "Patient fetch failed",
        description: "Unable to fetch patient details.",
      });
    } finally {
      setIsLoadingPatient(false);
    }
  };

  const handleSave = async () => {
    const patientId = patient.patientId?.trim();
    if (!patientId) {
      toast({
        variant: "destructive",
        title: "Patient ID required",
        description: "Enter patient ID before saving.",
      });
      return;
    }
    setIsSaving(true);
    try {
      await upsertPatient({
        ...patient,
        patientId,
      });
      toast({
        title: "Patient saved",
        description: "Patient details have been stored successfully.",
      });
      await loadPatients(query);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Save failed",
        description: error instanceof Error ? error.message : "Could not save patient.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container max-w-5xl py-8 space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Patient</h1>
          <p className="mt-2 text-muted-foreground">Create and manage patient records</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Patient Details</CardTitle>
            <CardDescription>Enter patient ID to auto-fetch existing records</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-4">
              <div className="md:col-span-3 space-y-2">
                <Label>Patient ID</Label>
                <Input
                  value={patient.patientId}
                  onChange={(e) => setPatient((prev) => ({ ...prev, patientId: e.target.value }))}
                  onBlur={handleFetchPatient}
                  placeholder="Enter patient ID"
                />
              </div>
              <div className="flex items-end">
                <Button onClick={handleFetchPatient} variant="outline" className="w-full gap-2" disabled={isLoadingPatient}>
                  {isLoadingPatient ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  Fetch
                </Button>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Full Name</Label>
                <Input
                  value={patient.fullName || ""}
                  onChange={(e) => setPatient((prev) => ({ ...prev, fullName: e.target.value }))}
                  placeholder="Patient name"
                />
              </div>
              <div className="grid gap-4 grid-cols-2">
                <div className="space-y-2">
                  <Label>Age</Label>
                  <Input
                    type="number"
                    min={0}
                    value={patient.age ?? ""}
                    onChange={(e) =>
                      setPatient((prev) => ({
                        ...prev,
                        age: e.target.value ? Number(e.target.value) : undefined,
                      }))
                    }
                    placeholder="Age"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Gender</Label>
                  <Select
                    value={patient.gender || undefined}
                    onValueChange={(value) => setPatient((prev) => ({ ...prev, gender: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Phone</Label>
              <Input
                value={patient.phone || ""}
                onChange={(e) => setPatient((prev) => ({ ...prev, phone: e.target.value }))}
                placeholder="Phone number"
              />
            </div>

            <div className="space-y-2">
              <Label>Address</Label>
              <Textarea
                rows={2}
                value={patient.address || ""}
                onChange={(e) => setPatient((prev) => ({ ...prev, address: e.target.value }))}
                placeholder="Address"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label>Medical History</Label>
                <Textarea
                  rows={4}
                  value={patient.medicalHistory || ""}
                  onChange={(e) => setPatient((prev) => ({ ...prev, medicalHistory: e.target.value }))}
                  placeholder="Past medical history"
                />
              </div>
              <div className="space-y-2">
                <Label>Allergies</Label>
                <Textarea
                  rows={4}
                  value={patient.allergies || ""}
                  onChange={(e) => setPatient((prev) => ({ ...prev, allergies: e.target.value }))}
                  placeholder="Known allergies"
                />
              </div>
              <div className="space-y-2">
                <Label>Diagnosis History</Label>
                <Textarea
                  rows={4}
                  value={patient.diagnosisHistory || ""}
                  onChange={(e) => setPatient((prev) => ({ ...prev, diagnosisHistory: e.target.value }))}
                  placeholder="Diagnosis history"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <Button onClick={handleSave} className="gap-2" disabled={isSaving}>
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save Patient
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Patient Records</CardTitle>
            <CardDescription>Search and load saved patients</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by patient ID, name, or phone"
              />
              <Button variant="outline" onClick={() => loadPatients(query)} className="gap-2" disabled={isListLoading}>
                {isListLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                Search
              </Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-secondary/50">
                    <th className="p-3 text-left font-semibold">Patient ID</th>
                    <th className="p-3 text-left font-semibold">Name</th>
                    <th className="p-3 text-left font-semibold">Phone</th>
                    <th className="p-3 text-left font-semibold">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {patients.map((row) => (
                    <tr
                      key={row.patientId}
                      className="border-b cursor-pointer hover:bg-secondary/30 transition-colors"
                      onClick={() => {
                        setPatient({
                          patientId: row.patientId,
                          fullName: row.fullName || "",
                          age: row.age,
                          gender: row.gender || "",
                          phone: row.phone || "",
                          address: row.address || "",
                          medicalHistory: row.medicalHistory || "",
                          allergies: row.allergies || "",
                          diagnosisHistory: row.diagnosisHistory || "",
                        });
                      }}
                    >
                      <td className="p-3">{row.patientId}</td>
                      <td className="p-3">{row.fullName || "N/A"}</td>
                      <td className="p-3">{row.phone || "N/A"}</td>
                      <td className="p-3">{row.updatedAt ? new Date(row.updatedAt).toLocaleString() : "N/A"}</td>
                    </tr>
                  ))}
                  {!isListLoading && patients.length === 0 && (
                    <tr>
                      <td colSpan={4} className="p-4 text-center text-muted-foreground">
                        No patients found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
