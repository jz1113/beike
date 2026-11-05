import { useAppStore } from '@client/store';
import { useDeconstructJobObserver } from '@client/features/assets/hooks/useDeconstructJobs';
import { requestDeconstructJobView } from '@client/features/assets/model/deconstructJobs';
import { requestWorkshopReferenceLibrary } from '@client/shared/navigation/commerceCanvas';
import { DeconstructJobNotifications } from '@client/features/assets/components/deconstruct/DeconstructJobNotifications';

export function DeconstructJobsHost() {
  const observer = useDeconstructJobObserver();
  return <DeconstructJobNotifications jobs={observer.visibleJobs} connectionError={observer.connectionError}
    onDismiss={observer.dismissJob} onStop={jobId => { void observer.stopJob(jobId); }}
    onView={jobId => {
      requestWorkshopReferenceLibrary();
      useAppStore.getState().setCurrentView('workshop');
      requestDeconstructJobView(jobId);
    }} />;
}
