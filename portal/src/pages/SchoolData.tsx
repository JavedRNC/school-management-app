import { api } from '../api';
import { DataTools } from '../DataTools';
import { ErrorBox, Loading, PageHead, useLoad } from '../ui';

export function SchoolData() {
  const { data, error, reload } = useLoad(() => api<{ code: string; name: string }>('/school/me'), []);
  return (
    <>
      <PageHead title="Import & export" sub={data ? `${data.name} only. The same files work in the Prangan app.` : 'Your school only.'} />
      {error ? <ErrorBox message={error} onRetry={reload} /> : data ? <DataTools base="/data" schoolCode={data.code} /> : <Loading rows={5} />}
    </>
  );
}
