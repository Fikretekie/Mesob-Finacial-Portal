#!/usr/bin/env bash
# Meksova owner console backend — one-shot setup for AWS CloudShell.
#
#   Upload this file in CloudShell (Actions → Upload file), then:
#     bash setup.sh staging    you@your-login-email.com
#     bash setup.sh production you@your-login-email.com   (after staging checks out)
#
# Safe to run more than once: it creates what's missing and updates the rest.
# Touches only the environment you name. Does not modify the MesobFinance Lambda.
set -euo pipefail

ENV_NAME="${1:-}"
OWNER_EMAIL="${2:-}"
case "$ENV_NAME" in
  staging)    POOL_ID="us-east-1_LLKrPQAEc" ;;
  production) POOL_ID="us-east-1_avAIOjCOE" ;;
  *) echo "Usage: bash $0 staging|production your-login@email.com"; exit 1 ;;
esac
REGION="us-east-1"
API_ID="iaqwrjhk4f"
AUTHORIZER_ID="apjxbd"
MONOLITH="MesobFinance:${ENV_NAME}"
FN="mesob-admin-${ENV_NAME}"
ROLE="mesob-admin-lambda-role"
ADMIN_TABLE="MesobAdminData_${ENV_NAME}"
SES_FROM="${SES_FROM:-}"

export AWS_DEFAULT_REGION="$REGION"
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
say() { printf '\n\033[1;34m== %s\033[0m\n' "$*"; }

if [ "$ENV_NAME" = "production" ]; then
  # Production only after the same code is running on staging.
  if ! aws lambda get-function --function-name mesob-admin-staging >/dev/null 2>&1; then
    echo "Set up staging first:  bash $0 staging your-login@email.com"; exit 1
  fi
fi

# ---------------------------------------------------------------------------
say "1/8 Finding the app's tables from ${MONOLITH}"
ENVJSON=$(aws lambda get-function-configuration --function-name "$MONOLITH" --query 'Environment.Variables' --output json)
# Staging tables carry "stag" in the setting name or table name; production ones don't.
pick() { echo "$ENVJSON" | python3 -c "
import json,sys,re
d=json.load(sys.stdin); want_stag=sys.argv[2]=='staging'
m=[v for k,v in d.items() if re.search(sys.argv[1],k,re.I) and re.search('table',k,re.I) and bool(re.search('stag',k+v,re.I))==want_stag]
print(m[0] if m else '')" "$1" "$ENV_NAME"; }
USERS_TABLE="${USERS_TABLE:-$(pick 'user')}"
TX_TABLE="${TX_TABLE:-$(pick 'transaction')}"
SUBS_TABLE="${SUBS_TABLE:-$(pick 'subscri')}"
echo "Users table:        ${USERS_TABLE:-NOT FOUND}"
echo "Transactions table: ${TX_TABLE:-NOT FOUND}"
echo "Subscriptions table:${SUBS_TABLE:- (none — subscription list will be empty)}"
if [ -z "$USERS_TABLE" ] || [ -z "$TX_TABLE" ]; then
  echo "Couldn't find the tables automatically. Re-run with USERS_TABLE=... TX_TABLE=... bash $0"
  echo "$ENVJSON"
  exit 1
fi
USERS_KEY=$(aws dynamodb describe-table --table-name "$USERS_TABLE" --query 'Table.KeySchema[?KeyType==`HASH`].AttributeName' --output text)
TX_USER_INDEX=$(aws dynamodb describe-table --table-name "$TX_TABLE" --query 'Table.GlobalSecondaryIndexes[?KeySchema[?AttributeName==`userId` && KeyType==`HASH`]].IndexName | [0]' --output text 2>/dev/null || true)
[ "$TX_USER_INDEX" = "None" ] && TX_USER_INDEX=""
echo "Users key: $USERS_KEY   Transactions userId index: ${TX_USER_INDEX:-none (will scan)}"

if [ "$ENV_NAME" = "production" ]; then
  echo
  echo "You're about to add the owner console to the LIVE app (app.meksova.com)."
  echo "Check the three table names above are the production ones."
  read -r -p "Type production to continue: " CONFIRM
  [ "$CONFIRM" = "production" ] || { echo "Stopped. Nothing was changed."; exit 1; }
fi

# ---------------------------------------------------------------------------
say "2/8 Admin data table ${ADMIN_TABLE}"
if ! aws dynamodb describe-table --table-name "$ADMIN_TABLE" >/dev/null 2>&1; then
  aws dynamodb create-table --table-name "$ADMIN_TABLE" \
    --attribute-definitions AttributeName=collection,AttributeType=S AttributeName=id,AttributeType=S \
    --key-schema AttributeName=collection,KeyType=HASH AttributeName=id,KeyType=RANGE \
    --billing-mode PAY_PER_REQUEST >/dev/null
  aws dynamodb wait table-exists --table-name "$ADMIN_TABLE"
  aws dynamodb update-continuous-backups --table-name "$ADMIN_TABLE" --point-in-time-recovery-specification PointInTimeRecoveryEnabled=true >/dev/null
  echo "created (with point-in-time recovery)"
else
  echo "already exists"
fi

# ---------------------------------------------------------------------------
say "3/8 IAM role ${ROLE}"
if ! aws iam get-role --role-name "$ROLE" >/dev/null 2>&1; then
  aws iam create-role --role-name "$ROLE" --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}' >/dev/null
  aws iam attach-role-policy --role-name "$ROLE" --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
  echo "created — waiting for IAM to propagate"
  sleep 12
fi
T="arn:aws:dynamodb:${REGION}:${ACCOUNT}:table"
SUBS_ARN=""
[ -n "$SUBS_TABLE" ] && SUBS_ARN=",\"${T}/${SUBS_TABLE}\""
cat > /tmp/admin-policy.json <<POLICY
{
  "Version": "2012-10-17",
  "Statement": [
    { "Effect": "Allow",
      "Action": ["dynamodb:GetItem","dynamodb:PutItem","dynamodb:UpdateItem","dynamodb:DeleteItem","dynamodb:Query","dynamodb:Scan"],
      "Resource": ["${T}/${ADMIN_TABLE}","${T}/${USERS_TABLE}","${T}/${TX_TABLE}","${T}/${TX_TABLE}/index/*"${SUBS_ARN}] },
    { "Effect": "Allow",
      "Action": ["cognito-idp:AdminCreateUser","cognito-idp:AdminDisableUser","cognito-idp:AdminEnableUser","cognito-idp:AdminDeleteUser","cognito-idp:ListUsers"],
      "Resource": "arn:aws:cognito-idp:${REGION}:${ACCOUNT}:userpool/${POOL_ID}" },
    { "Effect": "Allow", "Action": ["ses:SendEmail"], "Resource": "*" }
  ]
}
POLICY
aws iam put-role-policy --role-name "$ROLE" --policy-name "mesob-admin-${ENV_NAME}" --policy-document file:///tmp/admin-policy.json
echo "permissions set"

# ---------------------------------------------------------------------------
say "4/8 Lambda ${FN}"
mkdir -p /tmp/mesob-admin && cd /tmp/mesob-admin
cat > index.mjs <<'LAMBDA_EOF'
__LAMBDA_CODE__
LAMBDA_EOF
rm -f fn.zip && zip -q fn.zip index.mjs
ENVVARS=$(python3 -c "import json,sys; k=['ADMIN_TABLE','USERS_TABLE','USERS_KEY','TX_TABLE','TX_USER_INDEX','SUBS_TABLE','POOL_ID','SES_FROM']; print(json.dumps({'Variables':dict(zip(k,sys.argv[1:]))}))" \
  "$ADMIN_TABLE" "$USERS_TABLE" "$USERS_KEY" "$TX_TABLE" "$TX_USER_INDEX" "$SUBS_TABLE" "$POOL_ID" "$SES_FROM")
if aws lambda get-function --function-name "$FN" >/dev/null 2>&1; then
  aws lambda update-function-code --function-name "$FN" --zip-file fileb://fn.zip >/dev/null
  aws lambda wait function-updated --function-name "$FN"
  aws lambda update-function-configuration --function-name "$FN" --environment "$ENVVARS" >/dev/null
  aws lambda wait function-updated --function-name "$FN"
  echo "updated"
else
  aws lambda create-function --function-name "$FN" --runtime nodejs20.x --handler index.handler \
    --role "arn:aws:iam::${ACCOUNT}:role/${ROLE}" --zip-file fileb://fn.zip --timeout 20 --memory-size 256 \
    --environment "$ENVVARS" >/dev/null
  aws lambda wait function-active --function-name "$FN"
  echo "created"
fi
aws lambda add-permission --function-name "$FN" --statement-id apigw-admin \
  --action lambda:InvokeFunction --principal apigateway.amazonaws.com \
  --source-arn "arn:aws:execute-api:${REGION}:${ACCOUNT}:${API_ID}/*/*/MesobFinancialSystem/*" >/dev/null 2>&1 || true

# ---------------------------------------------------------------------------
say "5/8 API routes"
RESOURCES=$(aws apigateway get-resources --rest-api-id "$API_ID" --limit 500 --output json)
rid() { echo "$RESOURCES" | python3 -c "import json,sys; d=json.load(sys.stdin); print(next((i['id'] for i in d['items'] if i['path']==sys.argv[1]),''))" "$1"; }
ensure() { # parent-id path-part full-path
  local id; id=$(rid "$3")
  if [ -z "$id" ]; then
    id=$(aws apigateway create-resource --rest-api-id "$API_ID" --parent-id "$1" --path-part "$2" --query id --output text)
    RESOURCES=$(aws apigateway get-resources --rest-api-id "$API_ID" --limit 500 --output json)
  fi
  echo "$id"
}
URI="arn:aws:apigateway:${REGION}:lambda:path/2015-03-31/functions/arn:aws:lambda:${REGION}:${ACCOUNT}:function:mesob-admin-\${stageVariables.adminEnv}/invocations"
method() { # resource-id http-method auth(COGNITO|NONE)
  aws apigateway delete-method --rest-api-id "$API_ID" --resource-id "$1" --http-method "$2" >/dev/null 2>&1 || true
  if [ "$3" = "COGNITO" ]; then
    aws apigateway put-method --rest-api-id "$API_ID" --resource-id "$1" --http-method "$2" --authorization-type COGNITO_USER_POOLS --authorizer-id "$AUTHORIZER_ID" >/dev/null
  else
    aws apigateway put-method --rest-api-id "$API_ID" --resource-id "$1" --http-method "$2" --authorization-type NONE >/dev/null
  fi
  aws apigateway put-integration --rest-api-id "$API_ID" --resource-id "$1" --http-method "$2" --type AWS_PROXY --integration-http-method POST --uri "$URI" >/dev/null
}
ROOT=$(rid "/MesobFinancialSystem")
[ -z "$ROOT" ] && { echo "Couldn't find /MesobFinancialSystem in API ${API_ID}"; exit 1; }

R=$(ensure "$ROOT" SiteConfig /MesobFinancialSystem/SiteConfig)
method "$R" GET NONE; method "$R" PUT COGNITO; method "$R" OPTIONS NONE
for NAME in AdminData AdminStaff; do
  R=$(ensure "$ROOT" "$NAME" "/MesobFinancialSystem/${NAME}")
  method "$R" ANY COGNITO; method "$R" OPTIONS NONE
  P=$(ensure "$R" "{proxy+}" "/MesobFinancialSystem/${NAME}/{proxy+}")
  method "$P" ANY COGNITO; method "$P" OPTIONS NONE
done
for NAME in AdminMessages AdminAudit; do
  R=$(ensure "$ROOT" "$NAME" "/MesobFinancialSystem/${NAME}")
  method "$R" ANY COGNITO; method "$R" OPTIONS NONE
done
echo "routes: SiteConfig, AdminData/*, AdminStaff/*, AdminMessages, AdminAudit"

# ---------------------------------------------------------------------------
say "6/8 Deploying to the ${ENV_NAME} stage only"
# Route definitions are shared by both stages; each stage's adminEnv variable
# decides which Lambda (mesob-admin-staging / -production) answers it.
aws apigateway update-stage --rest-api-id "$API_ID" --stage-name "$ENV_NAME" \
  --patch-operations op=replace,path=/variables/adminEnv,value="$ENV_NAME" >/dev/null
DEP=$(aws apigateway create-deployment --rest-api-id "$API_ID" --stage-name "$ENV_NAME" --description "owner console admin routes" --query id --output text)
echo "deployment ${DEP}"

# ---------------------------------------------------------------------------
say "7/8 Smoke test"
BASE="https://${API_ID}.execute-api.${REGION}.amazonaws.com/${ENV_NAME}/MesobFinancialSystem"
# A new deployment answers 403 for a short while before the routes go live.
for i in $(seq 1 12); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/SiteConfig")" = "200" ] && break
  sleep 5
done
echo -n "GET  /SiteConfig (public, expect 200):        "; curl -s -o /dev/null -w '%{http_code}\n' "$BASE/SiteConfig"
echo -n "GET  /AdminData/users without login (expect 401): "; curl -s -o /dev/null -w '%{http_code}\n' "$BASE/AdminData/users"
echo -n "OPTIONS /AdminData/users (CORS, expect 204):   "; curl -s -o /dev/null -w '%{http_code}\n' -X OPTIONS "$BASE/AdminData/users"

# ---------------------------------------------------------------------------
say "8/8 Your account"
if [ -n "$OWNER_EMAIL" ]; then
  aws dynamodb scan --table-name "$USERS_TABLE" --filter-expression "email = :e" \
    --expression-attribute-values "{\":e\":{\"S\":\"${OWNER_EMAIL}\"}}" \
    --projection-expression "#k, email, #r" --expression-attribute-names "{\"#k\":\"${USERS_KEY}\",\"#r\":\"role\"}" \
    --query 'Items[0]' --output json
  echo "The console needs role = 0 on this record. If it isn't 0, tell Claude before changing it."
else
  echo "(Pass your login email as the first argument to see your account's role.)"
fi

say "Done — paste everything above back to Claude."
