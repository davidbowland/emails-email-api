// Identical copy of the sender-rule matching in emails-inbound-service's src/utils/bounce.ts; the rule cases live in
// __tests__/unit/spam-body-vectors.json, pinned by SHA-256 in each repo's tests. Change both copies together.

const extractDomainFromEmail = (email: string): string => {
  const match = email.match(/@([^@]+)$/)
  return match ? match[1] : ''
}

const matchesDomain = (senderDomain: string, domain: string): boolean =>
  domain.length > 0 && (senderDomain === domain || senderDomain.endsWith(`.${domain}`))

// Rules: `user@domain.com` matches that address exactly; `domain.com` and `@domain.com` match the domain and every
// subdomain, never a partial name (`notdomain.com`). The `*` wildcard is a bounce-only setting, handled by the caller.
export const matchesSenderRule = (address: string, rule: string): boolean => {
  const normalizedAddress = address.toLowerCase()
  const normalizedRule = rule.toLowerCase()
  const senderDomain = extractDomainFromEmail(normalizedAddress)

  if (normalizedRule.length > 0 && normalizedAddress === normalizedRule) {
    return true
  } else if (normalizedRule.startsWith('@')) {
    const ruleDomain = normalizedRule.slice(1)
    return !ruleDomain.includes('@') && matchesDomain(senderDomain, ruleDomain)
  } else if (!normalizedRule.includes('@')) {
    return matchesDomain(senderDomain, normalizedRule)
  }
  return false
}
