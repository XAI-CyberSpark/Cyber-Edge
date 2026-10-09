"""Request-local recovery snapshots. Never writes a project or includes SDK history."""
from pydantic import BaseModel,ConfigDict,Field
from app.schemas.project_schema import ProjectSchema

class AuthoringCheckpoint(BaseModel):
    model_config=ConfigDict(extra='ignore')
    revision:int=Field(default=0,ge=0)
    project:ProjectSchema
    completion_attempts:int=Field(default=0,ge=0)
    normalizations:int=Field(default=0,ge=0)
    call_timeouts:int=Field(default=0,ge=0)
    truncation_retries:int=Field(default=0,ge=0)
    truncation_skip_reason:str|None=None
    status_revisions:int=Field(default=0,ge=0)
    patch_total:int=Field(default=0,ge=0)
    patch_rejected:int=Field(default=0,ge=0)
    overload_retries:int=Field(default=0,ge=0)


def checkpoint(session,budget):
    calls=session.trace;patches=[c for c in calls if c['tool']=='oakegde_patch_graph']
    # Only executed trials contribute; cached/review-only calls reuse counts.
    retries=sum(c.get('result',{}).get('overload_retries',0) for c in calls if c['tool']=='oakegde_trial' and c.get('result',{}).get('trial_action')=='executed')
    return AuthoringCheckpoint(revision=session.revision,project=session.project,
        completion_attempts=budget.attempts,truncation_retries=getattr(budget,'truncation_retries',0),truncation_skip_reason=getattr(budget,'truncation_skip_reason',None),call_timeouts=getattr(budget,'call_timeouts',0),
        normalizations=sum(c.get('diagnostics',{}).get('normalizations',0) for c in calls),
        status_revisions=session.status_revisions,patch_total=len(patches),patch_rejected=sum(not c.get('ok') for c in patches),
        overload_retries=retries).model_dump()


def initial_checkpoint(request):
    project=request.current_project or ProjectSchema(id='incomplete',name=request.project_name or 'Untitled Workflow')
    return AuthoringCheckpoint(project=project).model_dump()
