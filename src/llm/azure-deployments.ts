/**
 * Azure OpenAI Deployment Auto-Discovery
 *
 * Fetches the list of deployments from an Azure OpenAI resource endpoint.
 * Used by the onboarding wizard (US-040) to populate the deployment picker.
 */

export interface AzureDeploymentInfo {
  readonly name: string
  readonly model: string
  readonly status: string
}

export type AzureAuth =
  | { readonly type: 'api-key'; readonly apiKey: string }
  | { readonly type: 'bearer'; readonly token: string }

export interface AzureDeploymentFilter {
  readonly status?: string
}

/**
 * Lists Azure OpenAI deployments from the given endpoint.
 *
 * Sends GET {endpoint}/openai/deployments?api-version={apiVersion}
 * with the appropriate auth header (api-key or Bearer token).
 *
 * Returns Array<{name, model, status}> parsed from response.data.
 * Returns empty array on any error -- never throws.
 *
 * @param endpoint - Azure resource URL (e.g. https://my-resource.openai.azure.com)
 * @param auth - Authentication credentials (api-key or bearer token)
 * @param apiVersion - Azure API version string
 * @param filter - Optional filter to narrow results (e.g. by status)
 */
export async function listAzureDeployments(
  endpoint: string,
  auth: AzureAuth,
  apiVersion: string,
  filter?: AzureDeploymentFilter
): Promise<readonly AzureDeploymentInfo[]> {
  try {
    const baseUrl = endpoint.endsWith('/') ? endpoint.slice(0, -1) : endpoint
    const url = `${baseUrl}/openai/deployments?api-version=${apiVersion}`

    const headers: Record<string, string> = auth.type === 'api-key'
      ? { 'api-key': auth.apiKey }
      : { 'Authorization': `Bearer ${auth.token}` }

    const response = await globalThis.fetch(url, {
      method: 'GET',
      headers,
    })

    if (!response.ok) {
      return []
    }

    const body = await response.json() as Record<string, unknown> | null

    if (body === null || body === undefined) {
      return []
    }

    const data = (body as Record<string, unknown>).data
    if (!Array.isArray(data)) {
      return []
    }

    const deployments: AzureDeploymentInfo[] = []
    for (const entry of data) {
      if (
        entry !== null &&
        typeof entry === 'object' &&
        typeof (entry as Record<string, unknown>).id === 'string' &&
        typeof (entry as Record<string, unknown>).model === 'string' &&
        (entry as Record<string, unknown>).model !== null
      ) {
        const item: AzureDeploymentInfo = {
          name: (entry as Record<string, unknown>).id as string,
          model: (entry as Record<string, unknown>).model as string,
          status: String((entry as Record<string, unknown>).status ?? ''),
        }
        deployments.push(item)
      }
    }

    if (filter?.status !== undefined) {
      return deployments.filter(d => d.status === filter.status)
    }

    return deployments
  } catch {
    return []
  }
}
