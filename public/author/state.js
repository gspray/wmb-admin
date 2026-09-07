'use strict';

export const AUTO_REVISION_COOLDOWN_MS = 10 * 60 * 1000;

export const state = {
    user:         null,
    role:         null,
    token:        null,
    project:      null,
    step:         1,
    questions:    [],
    qIndex:       0,
    alignQuestions: [],
    alignIntroQuestions: [],
    alignIndex:    0,
    /** Start My Book workspace — active lens (talk|questions). */
    alignActiveLens: 'questions',
    alignTalkFocus: null,
    /** When set, Discuss shows option chips for an answered question being edited. */
    alignDiscussEditQuestionId: '',
    /** Pending Discuss pivot after sidebar navigation ({ edit, index }). */
    pendingAlignDiscussPivot: null,
    /** After choosing Pet POV, show one-time celebration intro before next Start question. */
    alignPetPovIntroPending: false,
    sources:      [],
    outline:      null,
    bookPlan:     null,
    manuscript:   null,
    chatHistory:  [],
    generating:   false,
    /** Prevents stacked Write All confirms / concurrent draft runs. */
    writeAllChaptersLock: false,
    mediaRecorder: null,
    voiceChunks:  [],
    voiceSeconds: 0,
    voiceTimer:   null,
    speechRec:    null,
    liveTranscript: '',
    authorSettingsOpen: false,
    /** Book tools subview when panel=settings (`pace`, `clone-voice`, `print`, `ai-voice`). */
    authorSettingsView: '',
    /** Mobile Studio bottom-nav tab (`now`, `inbox`, `start`, …). */
    authorPhoneTab: 'now',
    authorNowOpen: false,
    authorInboxOpen: false,
    /** Desktop Publish My Book landing (publishing hub). */
    authorPublishOpen: false,
    /**
     * Author experience summary from GET /api/system/author/boot (Bundle A / M1).
     * Chrome consumers not wired yet — see public/author/experience.js.
     */
    experience: null,
    ghostwriterEnabledBookTypes: ['memoir'],
    ghostwriterEnabledBookSituations: ['started_one_company'],
    ghostwriterEnabledBookSituationsByType: { memoir: ['started_one_company'] },
    ghostwriterAvailableBookTypes: [],
    ghostwriterAvailableBookSituationsByType: {},
    ghostwriterPointOfView: 'first_person',
    ghostwriterNarratorAccess: 'personal',
    ghostwriterQuestionsModeEnabled: true,
    userVoiceClone: {
        configured: false,
        wireValue: '',
        voiceName: '',
        voiceId: '',
    },
    /** When set, Clone Voice settings ← Back returns here (e.g. Start My Book align voice question). */
    cloneVoiceSettingsReturn: null,
    /** When set, Set Pace ← Back returns here (step 2 banner or settings home). */
    paceSettingsReturn: null,
    /** When set, assignment Next shows Back to Review (opened question from review dialog). */
    assignmentReviewReturn: null,
    libraryDocs:  [],
    librarySelected: null,
    myDeskDirty:  false,
    /** Regular assignment nums unlocked by pace (informational; authors may open any assignment). */
    assignmentUnlockedNums: null,
    /** When set for an assignment num, Discuss opens a new Story Session on next render. */
    workspaceDiscussFreshStart: {},
    assignmentPaceMeta: null,
    /** Persisted + derived chapter/assignment workflow (Phase 2). */
    workflow: null,
    materialReconfirm: null,
    discoveryConfig: null,
    aboutYouSourceId: null,
    outlineChapterSelected: null,
    assignmentSelected: 1,
    /** Unified workspace — active lens per assignment num (questions|talk|review|draft). */
    workspaceActiveLens: {},
    workspaceSessionByAssignment: {},
    workspaceBookSessionId: '',
    /** Step 2 scope: assignment | book */
    step2Scope: 'assignment',
    /** Bumped on scope/right-panel render — stale async renders must not write DOM. */
    assignmentPanelRenderId: 0,
    /** Bumped on full Step 2 rebuild — concurrent renderStep2AboutYou calls bail out. */
    step2RenderId: 0,
    bookWorkspaceLens: 'talk',
    /** Cached book talk session when switching Review/Overview lenses. */
    bookTalkSessionCache: null,
    /** Cached assignment talk sessions when switching questions or lenses. */
    workspaceTalkSessionCache: {},
    /** Compact capture log entries per assignment (sidebar). */
    workspaceCaptureLogByAssignment: {},
    assignmentLensCache: {},
    /** Prefetched assignment story-review (Story check) by assignment num. */
    storyReviewPrefetch: {},
    /** Last Review visit per assignment — coverage snapshot for tab nudge. */
    workspaceReviewSeen: {},
    /** Question focus when entering Talk from Questions lens (per assignment). */
    workspaceTalkFocus: {},
    /** Assignment/question dropdowns: false in Discuss; true after Questions; sticky in Review/Preview. */
    workspaceAssignmentNavVisible: false,
    /** Cached short question gists per assignment num (for collapsed dropdown). */
    questionGistByAssignment: {},
    strategyPreview: 'chronological',
    assignmentQIndex: {},
    outlineChapterQIndex: 0,
    draftChapterSelected: null,
    chapterAnswers: {},
    readiness: null,
    readinessLoading: false,
    savedChapters: [],
    draftsNeedRewrite: false,
    briefRunController: null,
    draftRunController: null,
    narration: {
        isPlaying: false,
        stopRequested: false,
        audio: null,
        fetchController: null,
        memCache: new Map(),
        resumeChapterId: null,
        resumeHash: null,
        resumeIndex: 0,
        preferredVoice: '',
        preferredVoiceLoaded: false,
    },
    runStatus: {
        draft: { state: 'idle', message: 'Ready to draft chapters.' },
    },
    revisionDirty: false,
    revisionAutoInFlight: false,
    revisionLastAutoAt: 0,
    revisionLimitReached: false,
    canAutoRevision: false,
    /** Discuss: load session + scroll to message after assignment navigation (Phase 1.1). */
    pendingFollowUpSourceJump: null,
    /**
     * Write → Ghostwriter seed (Bundle D revision chips).
     * Consumed once by book talk composer.
     * @type {{ text: string, chapterNumber?: number|null } | null}
     */
    pendingBookDiscussPrompt: null,
    /**
     * Plan → Ghostwriter seed (propose-and-approve reaction chips).
     * Consumed once by plan talk composer.
     * @type {{ text: string } | null}
     */
    pendingPlanDiscussPrompt: null,
    /**
     * Phase 5 — Book tools deep links may temporarily restore demoted Interview lenses.
     * @type {string[] | null}
     */
    bookToolsForceLenses: null,
    /**
     * Phase 5 — Book tools may restore Write All / draft search on Write.
     * @type {{ writeAll?: boolean, draftSearch?: boolean } | null}
     */
    bookToolsForceWriteChrome: null,
    /**
     * Phase 5 — one-shot action after navigating from Book tools.
     * @type {{ type: string, lens?: string } | null}
     */
    pendingBookToolsAction: null,
};

/** True when opts match the current Step 2 right-panel render (omit opts on Step 4). */
export function isStep2PanelCurrent(opts) {
    if (!opts || opts._panelRenderId == null) return true;
    return opts._panelRenderId === state.assignmentPanelRenderId
        && opts._panelScope === 'assignment';
}
