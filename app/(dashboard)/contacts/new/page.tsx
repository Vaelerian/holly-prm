import { ContactForm } from "@/components/contacts/contact-form"

export default function NewContactPage() {
  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-xl font-semibold text-gray-900 mb-6">Add contact</h1>
      <ContactForm />
    </div>
  )
}
