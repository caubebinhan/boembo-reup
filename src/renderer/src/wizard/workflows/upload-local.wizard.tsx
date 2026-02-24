import { WizardStepConfig, WizardStepProps } from '../WizardStepTypes'
import { Step5_Target } from '../../components/wizard/Step5_Target'
import { FormField, TextInput } from '../shared'
import React, { useRef } from 'react'

// ─── Step: File Picker ────────────────────────────
function FilePickerStep({ data, updateData }: WizardStepProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const files: Array<{ name: string; path: string; caption: string }> = data.local_files || []

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return
    const newFiles = Array.from(e.target.files).map(f => ({
      name: f.name,
      path: (f as any).path || f.name,
      caption: '',
    }))
    updateData({ local_files: [...files, ...newFiles] })
  }

  const removeFile = (index: number) => {
    const updated = files.filter((_, i) => i !== index)
    updateData({ local_files: updated })
  }

  const updateCaption = (index: number, caption: string) => {
    const updated = [...files]
    updated[index] = { ...updated[index], caption }
    updateData({ local_files: updated })
  }

  return (
    <div>
      <h2 className="text-xl font-bold text-white mb-1">Upload Local Files</h2>
      <p className="text-gray-400 text-sm mb-6">Select video files from your computer to publish</p>

      <div className="mb-6">
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          multiple
          onChange={handleFileSelect}
          className="hidden"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="px-6 py-3 rounded-lg border-2 border-dashed border-gray-600 text-gray-300 
            hover:border-purple-500 hover:text-purple-400 transition w-full text-center"
        >
          📁 Click to select video files
        </button>
      </div>

      {files.length > 0 && (
        <div className="space-y-3">
          {files.map((file, i) => (
            <div key={i} className="bg-[#0f172a] rounded-lg p-4 border border-gray-700">
              <div className="flex items-center justify-between mb-2">
                <span className="text-white text-sm font-medium truncate flex-1 mr-3">
                  🎬 {file.name}
                </span>
                <button
                  onClick={() => removeFile(i)}
                  className="text-red-400 hover:text-red-300 text-sm transition"
                >
                  ✕
                </button>
              </div>
              <input
                type="text"
                value={file.caption}
                onChange={e => updateCaption(i, e.target.value)}
                placeholder="Caption for this video (optional)"
                className="w-full px-3 py-1.5 rounded bg-[#1e293b] border border-gray-700 text-white text-sm 
                  placeholder-gray-500 focus:outline-none focus:border-purple-500 transition"
              />
            </div>
          ))}
          <p className="text-gray-500 text-xs mt-2">{files.length} file(s) selected</p>
        </div>
      )}
    </div>
  )
}

// ─── Step: Caption Template ───────────────────────
function CaptionTemplateStep({ data, updateData }: WizardStepProps) {
  const template = data.captionTemplate || '{original}'
  const removeHashtags = data.removeHashtags ?? false
  const appendTags = data.appendTags || ''

  return (
    <div>
      <h2 className="text-xl font-bold text-white mb-1">Caption Settings</h2>
      <p className="text-gray-400 text-sm mb-6">Configure how captions will be generated</p>

      <FormField label="Caption Template" hint="Use {original} for the file caption">
        <TextInput
          value={template}
          onChange={v => updateData({ captionTemplate: v })}
          placeholder="{original}"
        />
      </FormField>

      <FormField label="Append Tags" hint="Extra tags/text added to every caption">
        <TextInput
          value={appendTags}
          onChange={v => updateData({ appendTags: v })}
          placeholder="#fyp #viral"
        />
      </FormField>

      <label className="flex items-center gap-3 text-gray-300 mt-4 cursor-pointer">
        <input
          type="checkbox"
          checked={removeHashtags}
          onChange={e => updateData({ removeHashtags: e.target.checked })}
          className="w-4 h-4 rounded bg-[#0f172a] border-gray-600 accent-purple-500"
        />
        Remove original hashtags
      </label>
    </div>
  )
}

// ─── Wizard Steps Config ──────────────────────────
export const uploadLocalSteps: WizardStepConfig[] = [
  {
    id: 'files',
    title: 'Files',
    icon: '📁',
    description: 'Select local video files to upload',
    component: FilePickerStep,
    validate: (data) => {
      const files = data.local_files || []
      if (files.length === 0) return 'Select at least one video file'
      return null
    },
  },
  {
    id: 'caption',
    title: 'Caption',
    icon: '📋',
    description: 'Configure caption template',
    component: CaptionTemplateStep,
  },
  {
    id: 'target',
    title: 'Target',
    icon: '🎯',
    description: 'Select accounts to publish to',
    component: Step5_Target,
    validate: (data) => {
      const accounts = data.selectedAccounts || data.accounts || []
      if (accounts.length === 0) return 'Select at least one publish account'
      return null
    },
  },
]
