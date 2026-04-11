import {
  registrationReceivedEmail,
  accountApprovedEmail,
  accountRejectedEmail,
  passwordResetEmail,
} from "@/lib/email-templates"

describe("registrationReceivedEmail", () => {
  it("returns subject and html containing the user name", () => {
    const { subject, html } = registrationReceivedEmail("Alice")
    expect(subject).toBe("Your Holly PRM registration is pending")
    expect(html).toContain("Alice")
    expect(html).toContain("pending")
  })
})

describe("accountApprovedEmail", () => {
  it("returns html containing name and sign-in URL", () => {
    const { subject, html } = accountApprovedEmail("Bob", "https://example.com/login")
    expect(subject).toBe("Your Holly PRM account has been approved")
    expect(html).toContain("Bob")
    expect(html).toContain("https://example.com/login")
  })
})

describe("accountRejectedEmail", () => {
  it("returns html containing the user name", () => {
    const { subject, html } = accountRejectedEmail("Carol")
    expect(subject).toBe("Your Holly PRM registration was not approved")
    expect(html).toContain("Carol")
  })
})

describe("passwordResetEmail", () => {
  it("returns html containing name and reset URL", () => {
    const { subject, html } = passwordResetEmail("Dan", "https://example.com/auth/reset-password?token=abc")
    expect(subject).toBe("Reset your Holly PRM password")
    expect(html).toContain("Dan")
    expect(html).toContain("https://example.com/auth/reset-password?token=abc")
    expect(html).toContain("1 hour")
  })
})
