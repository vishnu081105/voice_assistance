import { supabase } from '@/integrations/supabase/client';

export type ReportType = 'general' | 'soap' | 'diagnostic';

export interface Report {
  id: string;
  transcription: string;
  reportContent: string;
  reportType: ReportType;
  createdAt: Date;
  updatedAt: Date;
  duration: number;
  wordCount: number;
  patientId?: string;
  doctorName?: string;
  audioUrl?: string;
}

export interface Template {
  id: string;
  name: string;
  content: string;
  category: string;
  createdAt: Date;
}

export interface Setting {
  key: string;
  value: unknown;
}

// Helper function to get current user id from session
async function getCurrentUserId(): Promise<string> {
  try {
    const res = await supabase.auth.getSession();
    const session = (res as any)?.data?.session;
    if (!session?.user?.id) throw new Error('User not authenticated');
    return session.user.id;
  } catch (err) {
    throw new Error('User not authenticated');
  }
}

// Type-safe database client wrapper
const db = supabase as any;

// Report operations
export async function saveReport(report: Omit<Report, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
  const userId = await getCurrentUserId();
  try {
    const { data, error } = await db
      .from('reports')
      .insert({
        user_id: userId,
        transcription: report.transcription,
        report_content: report.reportContent,
        report_type: report.reportType,
        duration: report.duration,
        word_count: report.wordCount,
        patient_id: report.patientId,
        doctor_name: report.doctorName,
        audio_url: report.audioUrl,
      })
      .select('id')
      .single();
    if (error) {
      throw error;
    }
    return (data as any).id as string;
  } catch (err: any) {
    console.error('Error saving report:', err?.message ?? err);
    throw new Error(`Failed to save report: ${(err && err.message) || String(err)}`);
  }
}

export async function getReport(id: string): Promise<Report | undefined> {
  const userId = await getCurrentUserId();
  try {
    const { data, error } = await db
      .from('reports')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();
    if (error) {
      // If no rows found, return undefined
      return undefined;
    }
    if (!data) return undefined;
    return {
      id: data.id,
      transcription: data.transcription,
      reportContent: data.report_content,
      reportType: data.report_type as ReportType,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
      duration: data.duration,
      wordCount: data.word_count,
      patientId: data.patient_id,
      doctorName: data.doctor_name,
      audioUrl: data.audio_url,
    };
  } catch (err) {
    console.error('Error fetching report:', err);
    return undefined;
  }
}

export async function getAllReports(): Promise<Report[]> {
  const userId = await getCurrentUserId();
  try {
    const { data, error } = await db
      .from('reports')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map((row: any) => ({
      id: row.id,
      transcription: row.transcription,
      reportContent: row.report_content,
      reportType: row.report_type as ReportType,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      duration: row.duration,
      wordCount: row.word_count,
      patientId: row.patient_id,
      doctorName: row.doctor_name,
      audioUrl: row.audio_url,
    }));
  } catch (err) {
    console.error('Error fetching reports:', err);
    return [];
  }
}

export async function deleteReport(id: string): Promise<void> {
  const userId = await getCurrentUserId();
  try {
    const { error } = await db
      .from('reports')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);
    if (error) throw error;
  } catch (err) {
    console.error('Error deleting report:', err);
    throw err;
  }
}

export async function updateReport(id: string, updates: Partial<Omit<Report, 'id' | 'createdAt'>>): Promise<void> {
  const userId = await getCurrentUserId();
  try {
    const updateData: any = {};
    if (updates.transcription !== undefined) updateData.transcription = updates.transcription;
    if (updates.reportContent !== undefined) updateData.report_content = updates.reportContent;
    if (updates.reportType !== undefined) updateData.report_type = updates.reportType;
    if (updates.duration !== undefined) updateData.duration = updates.duration;
    if (updates.wordCount !== undefined) updateData.word_count = updates.wordCount;
    if (updates.patientId !== undefined) updateData.patient_id = updates.patientId;
    if (updates.doctorName !== undefined) updateData.doctor_name = updates.doctorName;
    if (updates.audioUrl !== undefined) updateData.audio_url = updates.audioUrl;
    updateData.updated_at = new Date().toISOString();

    const { error } = await db
      .from('reports')
      .update(updateData)
      .eq('id', id)
      .eq('user_id', userId);
    if (error) throw error;
  } catch (err) {
    console.error('Error updating report:', err);
    throw err;
  }
}

export async function searchReports(query: string): Promise<Report[]> {
  const userId = await getCurrentUserId();
  try {
    const { data, error } = await db
      .from('reports')
      .select('*')
      .eq('user_id', userId)
      .or(`transcription.ilike.%${query}%,report_content.ilike.%${query}%`)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map((row: any) => ({
      id: row.id,
      transcription: row.transcription,
      reportContent: row.report_content,
      reportType: row.report_type as ReportType,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      duration: row.duration,
      wordCount: row.word_count,
      patientId: row.patient_id,
      doctorName: row.doctor_name,
      audioUrl: row.audio_url,
    }));
  } catch (err) {
    console.error('Error searching reports:', err);
    return [];
  }
}

export async function clearAllReports(): Promise<void> {
  const userId = await getCurrentUserId();
  try {
    const { error } = await db
      .from('reports')
      .delete()
      .eq('user_id', userId);
    if (error) throw error;
  } catch (err) {
    console.error('Error clearing reports:', err);
    throw err;
  }
}

// Template operations
export async function saveTemplate(template: Omit<Template, 'id' | 'createdAt'>): Promise<void> {
  const userId = await getCurrentUserId();
  try {
    const { error } = await db
      .from('templates')
      .insert({
        user_id: userId,
        name: template.name,
        content: template.content,
        category: template.category,
      });
    if (error) throw error;
  } catch (err) {
    console.error('Error saving template:', err);
    throw err;
  }
}

export async function getAllTemplates(): Promise<Template[]> {
  const userId = await getCurrentUserId();
  try {
    const { data, error } = await db
      .from('templates')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map((row: any) => ({
      id: row.id,
      name: row.name,
      content: row.content,
      category: row.category,
      createdAt: new Date(row.created_at),
    }));
  } catch (err) {
    console.error('Error fetching templates:', err);
    return [];
  }
}

export async function deleteTemplate(id: string): Promise<void> {
  const userId = await getCurrentUserId();
  try {
    const { error } = await db
      .from('templates')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);
    if (error) throw error;
  } catch (err) {
    console.error('Error deleting template:', err);
    throw err;
  }
}

export async function clearAllTemplates(): Promise<void> {
  const userId = await getCurrentUserId();
  try {
    const { error } = await db
      .from('templates')
      .delete()
      .eq('user_id', userId);
    if (error) throw error;
  } catch (err) {
    console.error('Error clearing templates:', err);
    throw err;
  }
}

// Settings operations
export async function getSetting<T>(key: string): Promise<T | undefined> {
  const userId = await getCurrentUserId();
  try {
    const { data, error } = await db
      .from('settings')
      .select('value')
      .eq('user_id', userId)
      .eq('key', key)
      .single();
    if (error) return undefined;
    return data?.value as T;
  } catch (err) {
    console.error('Error getting setting:', err);
    return undefined;
  }
}

export async function setSetting<T>(key: string, value: T): Promise<void> {
  const userId = await getCurrentUserId();
  try {
    const { error } = await db
      .from('settings')
      .upsert({
        user_id: userId,
        key,
        value,
      }, { onConflict: 'user_id,key' });
    if (error) throw error;
  } catch (err) {
    console.error('Error setting setting:', err);
    throw err;
  }
}

export async function clearAllSettings(): Promise<void> {
  const userId = await getCurrentUserId();
  try {
    const { error } = await db
      .from('settings')
      .delete()
      .eq('user_id', userId);
    if (error) throw error;
  } catch (err) {
    console.error('Error clearing settings:', err);
    throw err;
  }
}

// Generate unique ID
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
