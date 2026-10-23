// Contract test for BATCH-PRESENT-4 (Paket 19/20/21/22): presenter view, presentation keyboard,
// ink keep/discard and media consent must be reachable and explicit.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { PresenterSidePanel } from '../../presenter/PresenterSidePanel';
import { PresentMediaEmbedModal } from '../../media/PresentMediaEmbedModal';

const here = dirname(fileURLToPath(import.meta.url));
const read = (relative) => readFileSync(resolve(here, relative), 'utf8');

const presenterModal = read('../../presenter/PresenterModeModal.tsx');
const controlBar = read('../../presenter/controls/PresenterControlBar.tsx');
const deckSurface = read('../../presenter/PresenterDeckSurface.tsx');
const mediaModal = read('../../media/PresentMediaEmbedModal.tsx');
const recordingModal = read('../../recording/PresentRecordingStudioModal.tsx');
const recording = read('../../recording/presentRecording.ts');

describe('presenter surfaces (Paket 19/20/21)', () => {
  it('shows the current slide, the next slide preview and the private notes on the presenter side', () => {
    const html = renderToStaticMarkup(createElement(PresenterSidePanel, {
      currentSlide: { id: 's1', title: 'One', subtitle: '', layout: 'blank', speakerNotes: 'Private note text' },
      nextSlide: { id: 's2', title: 'Two', subtitle: '', layout: 'blank' },
      slides: [{ id: 's1', title: 'One', subtitle: '', layout: 'blank' }, { id: 's2', title: 'Two', subtitle: '', layout: 'blank' }],
      currentIdx: 0,
      notesFontSize: 12,
      activeSequenceId: 'all',
      sequences: [{ id: 'all', label: 'All slides', slideIds: ['s1', 's2'] }],
      onSetNotesFontSize: vi.fn(),
      onJumpIndex: vi.fn(),
      onSelectSequence: vi.fn(),
    }));
    // The presenter's private notes are rendered for the presenter ...
    expect(html).toContain('Private note text');
    // ... and the next slide is previewed ("Auf zweitem Bildschirm Vorschau und Notizen").
    expect(html).toContain('Two');
    // Note font size is adjustable, which is the accessibility part of the same requirement.
    expect(html).toContain('A−');
    expect(html).toContain('A+');
  });

  it('keeps the audience window slide-only and hides the presenter chrome in kiosk mode', () => {
    // The audience portal renders `deckSurface(false)` and no side panel: notes must never be projected.
    const portal = presenterModal.slice(presenterModal.indexOf('audienceRoot && createPortal'));
    expect(portal).toContain('deckSurface(false)');
    expect(portal).not.toContain('PresenterSidePanel');
    // Kiosk mode removes the control bar and the notes panel ("ohne UI-Reste").
    expect(presenterModal).toContain('{!kioskMode && <PresenterControlBar');
    expect(presenterModal).toContain('{!kioskMode && <PresenterSidePanel');
    // Black and white screen are overlays above the deck.
    expect(presenterModal).toContain('{blackScreen && <div className="absolute inset-0 z-50 bg-black" />}');
    expect(presenterModal).toContain('{whiteScreen && <div className="absolute inset-0 z-50 bg-white" />}');
    expect(controlBar).toContain('onToggleKiosk');
  });

  it('offers an explicit keep-or-discard choice for live annotations', () => {
    expect(presenterModal).toContain('const discardAndExit = () => { setPendingExit(false); onClose(); };');
    expect(presenterModal).toContain('const commitAndExit = () => { if (!commitInk()) return; setPendingExit(false); onClose(); };');
    expect(presenterModal).toContain("{inkDirty && <button type=\"button\" onClick={commitInk}");
    expect(presenterModal).toContain('{copy.discard}');
    expect(presenterModal).toContain('{copy.keepAndExit}');
    // Ink is committed through the canonical slide update owned by PresentCanvas.
    expect(presenterModal).toContain('onCommitPresenterInk?.(inkBySlideId);');
    const presentCanvas = read('../../PresentCanvas.tsx');
    expect(presentCanvas).toContain('onCommitPresenterInk={(inkBySlideId) => {');
  });

  it('renders the deck through transition and morph frames rather than swapping slides', () => {
    expect(deckSurface).toContain('computePresentTransitionFrame');
    expect(deckSurface).toContain('buildPresentMorphFrame');
    expect(deckSurface).toContain('inkStrokes');
    expect(deckSurface).toContain('laserPos');
  });
});

describe('media and recording consent (Paket 22)', () => {
  it('never derives a media src from the draft URL', () => {
    expect(mediaModal).toContain('resolvePresentMediaPreview(');
    expect(mediaModal).toContain('{preview.src && mediaKind === \'video\'');
    expect(mediaModal).toContain('{preview.src && mediaKind === \'audio\'');
    // The previous behaviour - src={embedded?.dataUrl ?? externalUrl} - must be gone.
    expect(mediaModal).not.toContain('src={embedded?.dataUrl ?? externalUrl}');
    expect(mediaModal).toContain('data-present-media-preview-blocked');
  });

  it('requires a visible consent checkbox before an external preview is loaded', () => {
    expect(mediaModal).toContain('externalPreviewApproved');
    expect(mediaModal).toContain('checked={externalPreviewApproved}');
    expect(mediaModal).toContain('aria-label={copy.previewConsent}');
    expect(mediaModal).toContain('copy.previewBlocked(preview.host');
    // Consent resets per dialog session so reopening cannot silently re-contact a host.
    expect(mediaModal).toContain('setExternalPreviewApproved(false);');
  });

  it('gates recording behind explicit consent and refuses without it', () => {
    expect(recording).toContain('if (!request.consentGranted) throw new Error(');
    expect(recordingModal).toContain('if (!consent) {');
    expect(recordingModal).toContain('disabled={!consent || (!microphone && !camera)}');
    expect(recordingModal).toContain('copy.consentText');
    // No device is touched before the user confirms and presses record.
    expect(recordingModal).toContain('requestPresentRecordingMedia({ microphone, camera, consentGranted: consent })');
  });

  it('previews local media with preload=metadata only, never autoplay', () => {
    const html = renderToStaticMarkup(createElement(PresentMediaEmbedModal, {
      isOpen: true,
      slide: { id: 's1', title: 'T', subtitle: '', layout: 'blank' },
      onClose: vi.fn(),
      onUpdateMedia: vi.fn(),
    }));
    // No source is configured in this slide, so no media element may exist at all.
    expect(html).not.toContain('<video');
    expect(html).not.toContain('<audio');
    expect(html).not.toContain('data-present-media-preview');
    expect(mediaModal).not.toContain('autoPlay');
    expect(mediaModal).not.toContain('preload="auto"');
    expect(mediaModal).toContain('preload="metadata"');
  });
});
