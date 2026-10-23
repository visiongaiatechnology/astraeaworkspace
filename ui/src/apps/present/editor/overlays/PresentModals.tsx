// STATUS: DIAMANT VGT SUPREME — Present Modals Centralized Orchestrator
import React from 'react';
import {
  PresentDocumentModel,
  PresentSlide,
  PresentSection,
  PresentSlideComment,
} from '../../../../shared/contracts/workspace';
import { PresentMasterThemeModal } from '../../design/PresentMasterThemeModal';
import { PresentSectionsModal } from '../../sections/PresentSectionsModal';
import { PresentRecordingStudioModal } from '../../recording/PresentRecordingStudioModal';
import { PresentCommentsModal } from '../../review/PresentCommentsModal';
import { appendPresentActivity, appendPresentComment, deletePresentCommentThread, resolvePresentCommentThread } from '../../review/presentReviewCollaboration';
import { PresentMediaEmbedModal } from '../../media/PresentMediaEmbedModal';
import { PresentVideoExportModal } from '../../interchange/video/PresentVideoExportModal';
import { PresentSpeakerCoachModal } from '../../rehearsal/speaker-coach/PresentSpeakerCoachModal';

export interface PresentModalsProps {
  slide: PresentSlide;
  presentData: PresentDocumentModel;
  onUpdateSlide: (updated: PresentSlide) => void;
  onUpdatePresentData: (next: PresentDocumentModel) => void;

  showThemeModal: boolean;
  onCloseThemeModal: () => void;

  showSectionsModal: boolean;
  onCloseSectionsModal: () => void;

  showRehearsalModal: boolean;
  onCloseRehearsalModal: () => void;

  showCommentsModal: boolean;
  onCloseCommentsModal: () => void;

  showMediaModal: boolean;
  onCloseMediaModal: () => void;

  showVideoExportModal: boolean;
  onCloseVideoExportModal: () => void;


  showSpeakerCoachModal: boolean;
  onCloseSpeakerCoachModal: () => void;
}

export const PresentModals: React.FC<PresentModalsProps> = ({
  slide,
  presentData,
  onUpdateSlide,
  onUpdatePresentData,
  showThemeModal,
  onCloseThemeModal,
  showSectionsModal,
  onCloseSectionsModal,
  showRehearsalModal,
  onCloseRehearsalModal,
  showCommentsModal,
  onCloseCommentsModal,
  showMediaModal,
  onCloseMediaModal,
  showVideoExportModal,
  onCloseVideoExportModal,
  showSpeakerCoachModal,
  onCloseSpeakerCoachModal,
}) => {
  return (
    <>
      {/* 1. Theme & Master Modal */}
      {showThemeModal && (
        <PresentMasterThemeModal
          presentData={presentData}
          onUpdatePresentData={onUpdatePresentData}
          onClose={onCloseThemeModal}
          activeSlideId={slide.id}
        />
      )}

      {/* 2. Sections Modal */}
      <PresentSectionsModal
        isOpen={showSectionsModal}
        sections={presentData.sections || []}
        slides={presentData.slides}
        onClose={onCloseSectionsModal}
        onUpdateSections={(sections: PresentSection[]) => {
          onUpdatePresentData({ ...presentData, sections });
        }}
        onAssignSlideSection={(slideId, sectionId) => {
          const updatedSlides = presentData.slides.map((s) =>
            s.id === slideId ? { ...s, sectionId } : s
          );
          onUpdatePresentData({ ...presentData, slides: updatedSlides });
          if (slide.id === slideId) {
            onUpdateSlide({ ...slide, sectionId });
          }
        }}
        customShows={presentData.customShows || []}
        onUpdateCustomShows={(customShows) => onUpdatePresentData({ ...presentData, customShows })}
      />

      {/* 3. Recording & Rehearsal Studio */}
      <PresentRecordingStudioModal
        isOpen={showRehearsalModal}
        presentData={presentData}
        onClose={onCloseRehearsalModal}
        onUpdatePresentData={onUpdatePresentData}
      />

      {/* 4. Slide Comments Modal */}
      <PresentCommentsModal
        isOpen={showCommentsModal}
        slide={slide}
        onClose={onCloseCommentsModal}
        onAddComment={(c: PresentSlideComment) => {
          const comments = appendPresentComment(slide.comments || [], c);
          const slides = presentData.slides.map((candidate) => candidate.id === slide.id ? { ...candidate, comments } : candidate);
          onUpdatePresentData(appendPresentActivity({ ...presentData, slides }, { actor: c.author, action: c.parentId ? 'reply' : 'comment', slideId: slide.id, objectId: c.targetObjectId, summary: c.parentId ? 'Replied to a slide review thread' : 'Added a slide review comment' }));
        }}
        onToggleResolve={(commentId: string) => {
          const current = (slide.comments || []).find((c) => c.id === commentId);
          const comments = resolvePresentCommentThread(slide.comments || [], commentId, !(current?.resolved ?? false));
          const slides = presentData.slides.map((candidate) => candidate.id === slide.id ? { ...candidate, comments } : candidate);
          onUpdatePresentData(appendPresentActivity({ ...presentData, slides }, { actor: 'Reviewer VGT', action: 'resolve', slideId: slide.id, summary: current?.resolved ? 'Reopened a slide review thread' : 'Resolved a slide review thread' }));
        }}
        onDeleteComment={(commentId: string) => {
          const comments = deletePresentCommentThread(slide.comments || [], commentId);
          onUpdatePresentData({ ...presentData, slides: presentData.slides.map((candidate) => candidate.id === slide.id ? { ...candidate, comments } : candidate) });
        }}
      />

      {/* 5. Media Embed Modal */}
      <PresentMediaEmbedModal
        isOpen={showMediaModal}
        slide={slide}
        onClose={onCloseMediaModal}
        onUpdateMedia={(patch) => {
          onUpdateSlide({ ...slide, ...patch });
        }}
      />

      {/* 6. Video Export Modal */}
      <PresentVideoExportModal
        isOpen={showVideoExportModal}
        onClose={onCloseVideoExportModal}
        presentData={presentData}
        presentationTitle={presentData.slides[0]?.title || 'Präsentation'}
      />

      {/* 7. Local Speaker Coach Modal */}
      <PresentSpeakerCoachModal
        isOpen={showSpeakerCoachModal}
        onClose={onCloseSpeakerCoachModal}
        slides={presentData.slides}
      />
    </>
  );
};
