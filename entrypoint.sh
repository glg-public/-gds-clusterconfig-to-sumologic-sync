#!/bin/bash -l
set -o nounset;
set -o errexit;
set -o pipefail;

IFS=$'\n\t'

function create_insert_heredoc () {
  local OUTPUT_FILE="$1"
  cat > "${OUTPUT_FILE}" << DOC
{
  "row": [
    { "columnName": "cluster", "columnValue": "${CLUSTER}" },
    { "columnName": "service", "columnValue": "${SERVICE}" },
    { "columnName": "ecr_repo", "columnValue": "${ECR_REPO}" },
    { "columnName": "ecr_tag", "columnValue": "${ECR_TAG}" },
    { "columnName": "git_repo", "columnValue": "${GIT_REPO}" },
    { "columnName": "git_branch", "columnValue": "${GIT_BRANCH}" }
  ]
}
DOC
}

function dev_config_heredoc () {
  cat << DOC
{
  "SUMOLOGIC_ACCESS_ID": "${SUMOLOGIC_ACCESS_ID}",
  "SUMOLOGIC_ACCESS_KEY": "${SUMOLOGIC_ACCESS_KEY}",
  "SUMOLOGIC_API_ENDPOINT": "https://api.us2.sumologic.com/api"
}
DOC
}

# if the keys are in the environment (should be dev only), use those
if [[ -n "${SUMOLOGIC_ACCESS_ID:-}" && -n "${SUMOLOGIC_ACCESS_KEY}:-" ]]; then
  >&2 echo ":: use dev environment sumo access variables"
  INPUT_SUMOLOGIC_CONFIG="$(dev_config_heredoc)"
fi
# load the sumolgic config into environment variables
# shellcheck source=/dev/null
source <( \
  echo "${INPUT_SUMOLOGIC_CONFIG}" | \
  jq -r 'to_entries | .[] | "export " + .key + "=\"" + .value + "\""' \
)

if [[ "${GITHUB_REPOSITORY}" =~ [^/]+\/gds.clusterconfig.(.*) ]]; then
  # otherwise it has to match the gds clusterconfig repo name syntax
  CLUSTER="${BASH_REMATCH[1]}"
else
  # override if provided via the action
  CLUSTER="${INPUT_CLUSTER}"
  if [[ -z "${CLUSTER}" ]]; then
    echo "Your repository must be named gds.clusterconfig.* or you have to" \
      "provide the 'cluster' github action parameter"
          exit 1
  fi
fi

while IFS= read -r -d '' FILE; do
  unset SERVICE ECR_REPO GIT_REPO GIT_BRANCH TYPE REPOSITORY
  # service is based on directory name
  SERVICE="$(basename "$(dirname "$FILE")")"

  # parse out the deploy commands we support
  IFS=$' \t' read -r TYPE REPOSITORY <<< \
    "$(grep -e "^\(auto\|docker\)deploy\s" "$FILE" | tail -n1)"

  if [[ "${TYPE}" == "dockerdeploy" ]]; then
    # eg. github/glg/epi-screamer/gds-migration:latest
    if [[ "${REPOSITORY}" =~ ([^/]+)\/([^/]+)\/([^/]+)\/([^:]+)(:(.*))? ]]; then
      #                      ↑        ↑        ↑        ↑      ↑ ↑
      #                      |        |        |        |      5 6 docker tag
      #                      |        2 org    3 repo   4 branch
      #                      1 source control provider (eg. github)
      ECR_REPO="${REPOSITORY}"
      ECR_REPO="${BASH_REMATCH[1]}/${BASH_REMATCH[2]}/${BASH_REMATCH[3]}"
      # ERE does not support non-capturing groups, that's why branch is in 6
      ECR_TAG="${BASH_REMATCH[6]:-latest}"
      GIT_REPO="${BASH_REMATCH[2]}/${BASH_REMATCH[3]}"
      GIT_BRANCH="${BASH_REMATCH[4]}"
    fi
  fi

  if [[ "${TYPE}" == "autodeploy" ]]; then
    # NOTE: autodeploy WITHOUT branch specification won't work, but
    #       should also not be allowed via cc-screamer
    #       eg. git@github.com:glg/log.git#master
    if [[ "${REPOSITORY}" =~ git@github.com:([^#]+).git#(.*) ]]; then
      #                                     ↑           ↑
      #                                     1 org/repo  2 branch
      ECR_REPO="${CLUSTER}.glgresearch.com/${SERVICE}"
      ECR_TAG="latest"
      GIT_REPO="${BASH_REMATCH[1]}"
      GIT_BRANCH="${BASH_REMATCH[2]}"
    fi
  fi

  if [[ -z "${GIT_REPO:-}" ]]; then
    echo "error: ${CLUSTER}/${FILE}: unable to extract GIT_REPO"
    continue
  fi

  create_insert_heredoc /tmp/payload

  # NOTE: hardcoded for now, might optimize that later
  declare -a TABLE_IDS=( "0000000001007719" "0000000000FF668A" )

  for TABLE_ID in "${TABLE_IDS[@]}"; do
    curl \
      -XPUT \
      --header 'Content-Type: application/json' \
      --silent \
      --show-error \
      --user "${SUMOLOGIC_ACCESS_ID}:${SUMOLOGIC_ACCESS_KEY}" \
      --data @/tmp/payload \
      --output /tmp/output \
      --write-out "status_code:%{http_code} ${TABLE_ID},[$CLUSTER,$SERVICE],$TYPE,[$ECR_REPO,$ECR_TAG],[$GIT_REPO,$GIT_BRANCH]\n" \
      "${SUMOLOGIC_API_ENDPOINT}/v1/lookupTables/${TABLE_ID}/row" \
      || true
    done

  done < <(find . -type f -name orders -maxdepth 2 -print0)
