"""Recruitment domain constants + Pydantic models. Single source for statuses."""
from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel, Field

# Centralized lead status engine (stage order matters for the funnel).
LEAD_STATUSES = ["new", "contacted", "interested", "lineup", "selected", "joined",
                 "not_interested", "rejected", "invalid"]
FUNNEL_ORDER = ["new", "contacted", "interested", "lineup", "selected", "joined"]
NEGATIVE_STATUSES = ["not_interested", "rejected", "invalid"]
ACTIVE_STATUSES = ["new", "contacted", "interested", "lineup", "selected"]
FINAL_STATUSES = ["joined", "not_interested", "rejected", "invalid"]
# Statuses that demand a closure/lost reason when transitioned into.
REASON_REQUIRED_STATUSES = ["rejected", "not_interested", "invalid"]

STATUS_LABELS = {
    "new": "New", "contacted": "Contacted", "interested": "Interested",
    "lineup": "Interview Lineup", "selected": "Selected", "joined": "Joined",
    "not_interested": "Not Interested", "rejected": "Rejected", "invalid": "Invalid Lead",
}

# Allowed transitions (kept permissive but explicit). Any -> negative always allowed.
ALLOWED_TRANSITIONS = {
    "new": ["contacted", "interested", "not_interested", "rejected", "lineup", "invalid", "selected"],
    "contacted": ["interested", "lineup", "not_interested", "rejected", "new", "invalid", "selected"],
    "interested": ["lineup", "selected", "not_interested", "rejected", "contacted", "invalid"],
    "lineup": ["selected", "rejected", "not_interested", "interested", "invalid"],
    "selected": ["joined", "rejected", "lineup"],
    "joined": ["rejected"],
    "not_interested": ["new", "contacted", "interested"],
    "rejected": ["new", "contacted", "interested"],
    "invalid": ["new", "contacted"],
}

# Legacy simple call outcomes (kept for the lightweight quick-call path).
CALL_OUTCOMES = ["connected", "no_answer", "busy", "wrong_number", "callback",
                 "interested", "not_interested"]

# ---- Disposition engine (Prompt 10) ----
CONNECTED_OUTCOMES = ["connected_interested", "not_interested", "callback_requested",
                      "interview_scheduled", "already_working", "salary_issue",
                      "location_issue", "job_mismatch"]
NOT_CONNECTED_OUTCOMES = ["no_answer", "busy", "switched_off", "unreachable",
                          "invalid_number", "whatsapp_only", "call_back_later"]
DISPOSITION_OUTCOMES = CONNECTED_OUTCOMES + NOT_CONNECTED_OUTCOMES
DISPOSITION_LABELS = {
    "connected_interested": "Connected – Interested", "not_interested": "Not Interested",
    "callback_requested": "Callback Requested", "interview_scheduled": "Interview Scheduled",
    "already_working": "Already Working", "salary_issue": "Salary Issue",
    "location_issue": "Location Issue", "job_mismatch": "Job Mismatch",
    "no_answer": "No Answer", "busy": "Busy", "switched_off": "Switched Off",
    "unreachable": "Unreachable", "invalid_number": "Invalid Number",
    "whatsapp_only": "WhatsApp Only", "call_back_later": "Call Back Later",
}
# Outcomes that make the next follow-up mandatory.
CALLBACK_OUTCOMES = ["callback_requested", "call_back_later"]
# Outcome -> forced final status.
AUTO_FINAL_MAP = {"not_interested": "not_interested", "invalid_number": "invalid"}

LEAD_PRIORITIES = ["low", "medium", "high"]
GENDERS = ["male", "female", "other"]
INTERVIEW_TYPES = ["walkin", "telephonic", "virtual", "f2f"]
FOLLOWUP_STATUS = ["pending", "done", "cancelled", "superseded"]
TASK_STATUS = ["pending", "in_progress", "done", "cancelled"]
TASK_CATEGORIES = ["candidate_followup", "client_followup", "vendor_followup",
                   "interview_prep", "marketing_task", "general_admin"]
INTERVIEW_STATUS = ["scheduled", "confirmed", "attended", "no_show", "selected", "rejected"]
JOINING_STATUS = ["pending", "confirmed", "joined", "dropped"]

# Saved-view chips (Prompt 06) resolved server-side.
SAVED_VIEWS = ["all", "fresh", "not_called", "todays_followups", "overdue", "no_followup",
               "no_answer", "interested", "hot", "interviews", "attendance_pending",
               "selected", "joining_this_week", "joined", "rejected_lost"]


class LeadCreate(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    phone: str = Field(min_length=3, max_length=32)
    alt_phone: Optional[str] = None
    email: Optional[str] = None
    city: Optional[str] = None
    age: Optional[int] = Field(default=None, ge=14, le=99)
    gender: Optional[str] = None
    qualification: Optional[str] = None
    experience: Optional[str] = None
    current_salary: Optional[str] = None
    expected_salary: Optional[str] = None
    notice_period: Optional[str] = None
    source: Optional[str] = "manual"
    role_applied: Optional[str] = None
    priority: str = "medium"
    owner_id: Optional[str] = None  # admin/TL may assign; else self
    client: Optional[str] = None
    job: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    notes: Optional[str] = None
    # create-only first follow-up
    first_followup_at: Optional[datetime] = None
    first_followup_reason: Optional[str] = "First call"
    duplicate_ack: bool = False  # create-as-flagged-duplicate acknowledgement


class LeadUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    alt_phone: Optional[str] = None
    email: Optional[str] = None
    city: Optional[str] = None
    age: Optional[int] = Field(default=None, ge=14, le=99)
    gender: Optional[str] = None
    qualification: Optional[str] = None
    experience: Optional[str] = None
    current_salary: Optional[str] = None
    expected_salary: Optional[str] = None
    notice_period: Optional[str] = None
    source: Optional[str] = None
    role_applied: Optional[str] = None
    priority: Optional[str] = None
    owner_id: Optional[str] = None
    client: Optional[str] = None
    job: Optional[str] = None
    tags: Optional[List[str]] = None
    notes: Optional[str] = None


class StatusChange(BaseModel):
    status: str
    note: Optional[str] = None
    closure_reason: Optional[str] = None
    expected_joining_date: Optional[datetime] = None


class CallCreate(BaseModel):
    outcome: str
    notes: Optional[str] = None
    duration_seconds: Optional[int] = 0


class InterviewInline(BaseModel):
    scheduled_at: datetime
    client: str = Field(min_length=1)
    job: str = Field(min_length=1)
    type: str
    location: Optional[str] = None
    contact_person: Optional[str] = None
    notes: Optional[str] = None


class DispositionCreate(BaseModel):
    outcome: str
    notes: Optional[str] = None
    duration_seconds: Optional[int] = 0
    next_followup_at: Optional[datetime] = None
    next_followup_reason: Optional[str] = None
    status_override: Optional[str] = None
    interview: Optional[InterviewInline] = None
    expected_joining_date: Optional[datetime] = None
    closure_reason: Optional[str] = None


class FollowupCreate(BaseModel):
    due_at: datetime
    reason: Optional[str] = None
    notes: Optional[str] = None


class FollowupUpdate(BaseModel):
    status: Optional[str] = None
    due_at: Optional[datetime] = None
    reason: Optional[str] = None
    notes: Optional[str] = None


class FollowupComplete(BaseModel):
    outcome: Optional[str] = None
    notes: Optional[str] = None
    mode: str = "next"  # "next" | "final"
    next_due_at: Optional[datetime] = None
    next_reason: Optional[str] = None
    final_status: Optional[str] = None
    closure_reason: Optional[str] = None
    expected_joining_date: Optional[datetime] = None


class TagsUpdate(BaseModel):
    tags: List[str]


class NoteCreate(BaseModel):
    body: str = Field(min_length=1, max_length=4000)


class NoteUpdate(BaseModel):
    body: str = Field(min_length=1, max_length=4000)


class AssignRequest(BaseModel):
    lead_ids: List[str]
    to_owner_id: str


class TransferRequest(BaseModel):
    lead_ids: List[str]
    to_owner_id: str


class AutoDistributeRequest(BaseModel):
    lead_ids: Optional[List[str]] = None  # None => all in scope matching filters
    recruiter_ids: Optional[List[str]] = None  # target pool; default = all in scope


class TaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    category: str = "general_admin"
    due_at: Optional[datetime] = None
    priority: str = "medium"
    lead_id: Optional[str] = None
    related_entity: Optional[str] = None
    notes: Optional[str] = None
    owner_id: Optional[str] = None


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    category: Optional[str] = None
    due_at: Optional[datetime] = None
    priority: Optional[str] = None
    status: Optional[str] = None
    related_entity: Optional[str] = None
    notes: Optional[str] = None


class InterviewCreate(BaseModel):
    scheduled_at: datetime
    mode: Optional[str] = "phone"
    client: Optional[str] = None
    job: Optional[str] = None
    location: Optional[str] = None
    contact_person: Optional[str] = None
    notes: Optional[str] = None


class InterviewUpdate(BaseModel):
    status: Optional[str] = None
    scheduled_at: Optional[datetime] = None
    notes: Optional[str] = None


class JoiningCreate(BaseModel):
    joining_date: datetime
    notes: Optional[str] = None


class JoiningUpdate(BaseModel):
    status: Optional[str] = None
    joining_date: Optional[datetime] = None
    notes: Optional[str] = None
