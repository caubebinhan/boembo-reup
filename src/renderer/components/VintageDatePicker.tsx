/**
 * VintageDatePicker — react-datepicker wrapper styled for vintage pastel theme
 */
import DatePicker from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'
import './VintageDatePicker.css'
import { vi } from 'date-fns/locale'

interface VintageDatePickerProps {
    selected: Date | null
    onChange: (date: Date | null) => void
    placeholder?: string
    showTimeSelect?: boolean
    dateFormat?: string
    minDate?: Date
    maxDate?: Date
    className?: string
    id?: string
}

export function VintageDatePicker({
    selected,
    onChange,
    placeholder = 'Chọn ngày...',
    showTimeSelect = false,
    dateFormat,
    minDate,
    maxDate,
    className = '',
    id,
}: VintageDatePickerProps) {
    const fmt = dateFormat || (showTimeSelect ? 'dd/MM/yyyy HH:mm' : 'dd/MM/yyyy')
    return (
        <DatePicker
            id={id}
            selected={selected}
            onChange={onChange}
            placeholderText={placeholder}
            showTimeSelect={showTimeSelect}
            timeFormat="HH:mm"
            timeIntervals={15}
            timeCaption="Giờ"
            dateFormat={fmt}
            locale={vi}
            minDate={minDate}
            maxDate={maxDate}
            className={`vintage-datepicker-input ${className}`}
            calendarClassName="vintage-datepicker-calendar"
            popperClassName="vintage-datepicker-popper"
            showPopperArrow={false}
            autoComplete="off"
            isClearable
        />
    )
}
