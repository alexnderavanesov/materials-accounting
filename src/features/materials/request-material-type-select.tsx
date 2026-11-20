import { AppSelect } from '#/components/ui/app-select'

export function RequestMaterialTypeSelect({
  options,
  value,
  error,
  onToggle,
}: {
  options: string[]
  value: string[]
  error?: string
  onToggle: (type: string, checked: boolean) => void
}) {
  return (
    <div>
      <AppSelect
        label="Типы материала"
        options={options.map((option) => ({ value: option, label: option }))}
        value=""
        onChange={() => {}}
        multiple={value}
        onToggle={onToggle}
      />
      {error && (
        <p role="alert" className="mt-1 text-sm text-amber-800">
          {error}
        </p>
      )}
    </div>
  )
}
