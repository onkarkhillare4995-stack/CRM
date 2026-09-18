# Auth Testing Playbook (Recruitment CRM)

## Credentials
See /app/memory/test_credentials.md
- Admin: okhillare23@gmail.com / Admin@Oak2026
- Team Leader: teamlead@oaksphere.demo / TeamLead@123
- Recruiter: recruiter@oaksphere.demo / Recruiter@123

## Notes
- Auth is JWT bearer token (returned in login body as access_token) PLUS httpOnly cookies.
- Frontend sends Authorization: Bearer <token> and withCredentials.
- Sessions are revocable (sessions collection). Logout revokes the session.

## API smoke
```
API=https://talent-hub-936.preview.emergentagent.com/api
TOKEN=$(curl -s -X POST $API/auth/login -H "Content-Type: application/json" \
  -d '{"email":"okhillare23@gmail.com","password":"Admin@Oak2026"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")
curl -s $API/auth/me -H "Authorization: Bearer $TOKEN"
```

## Authorization denial checks
- Recruiter GET /api/users should only return self.
- Recruiter GET /api/users/<other_id> => 403 forbidden.
- Recruiter POST /api/users => 403 (no users.create).
- Team leader GET /api/users returns only their team members + self.
