import { useState, useEffect } from 'react';
import { Header } from '@/components/Header';
import { ReportCard } from '@/components/ReportCard';
import { getAllReports, deleteReport, searchReports, Report } from '@/lib/db';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, FileText, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { downloadReportAsPDF } from '@/utils/reportExport';

export default function History() {
  const [reports, setReports] = useState<Report[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const { toast } = useToast();

  const loadReports = async () => {
    try {
      const allReports = searchQuery
        ? await searchReports(searchQuery)
        : await getAllReports();
      
      const sorted = [...allReports].sort((a, b) => {
        const dateA = new Date(a.createdAt).getTime();
        const dateB = new Date(b.createdAt).getTime();
        return sortOrder === 'newest' ? dateB - dateA : dateA - dateB;
      });
      
      setReports(sorted);
    } catch (err) {
      console.error('Failed to load reports:', err);
      toast({
        variant: 'destructive',
        title: 'Failed to load reports',
        description: 'Please try again later.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadReports();
  }, [searchQuery, sortOrder]);

  const handleDelete = async (id: string) => {
    try {
      await deleteReport(id);
      setReports((prev) => prev.filter((r) => r.id !== id));
      toast({
        title: 'Report deleted',
        description: 'The report has been removed.',
      });
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Delete failed',
        description: 'Failed to delete the report.',
      });
    }
  };

  const handleDownload = (report: Report) => {
    downloadReportAsPDF(report);

    toast({
      title: 'Download started',
      description: 'The PDF report is being downloaded.',
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container max-w-4xl py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Report</h1>
          <p className="mt-2 text-muted-foreground">
            View and manage your saved transcriptions and reports
          </p>
        </div>

        {/* Search and Filter */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search reports..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={sortOrder} onValueChange={(v) => setSortOrder(v as 'newest' | 'oldest')}>
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest first</SelectItem>
              <SelectItem value="oldest">Oldest first</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Reports List */}
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : reports.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-4 py-12">
              <FileText className="h-12 w-12 text-muted-foreground/50" />
              <div className="text-center">
                <h3 className="text-lg font-medium">No reports found</h3>
                <p className="text-muted-foreground">
                  {searchQuery
                    ? 'Try adjusting your search terms'
                    : 'Start recording to create your first report'}
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {reports.map((report) => (
              <ReportCard
                key={report.id}
                report={report}
                onDelete={handleDelete}
                onDownload={handleDownload}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
