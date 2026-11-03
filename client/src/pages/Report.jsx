
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

export default function Report() {
  const [form, setForm] = useState({
    animalType: 'Dog',
    emergencyType: 'Injured in accident',
    description: '',
    imageUrl: '',
    city: '',
    state: '',
    address: '',
    latitude: '',
    longitude: ''
  });

  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [preview, setPreview] = useState('');
  const [uploading, setUploading] = useState(false);
  const [photoSelected, setPhotoSelected] = useState(false);

  const cameraRef = useRef(null);
  const galleryRef = useRef(null);
  const previewRef = useRef(null);

  const nav = useNavigate();

  useEffect(() => {
    return () => {
      if (previewRef.current) {
        URL.revokeObjectURL(previewRef.current);
      }
    };
  }, []);

  const change = e => {
    setForm(f => ({
      ...f,
      [e.target.name]: e.target.value
    }));
  };

  const selectPhoto = async e => {
    const file = e.target.files?.[0];

    // Allow selecting the same photo again
    e.target.value = '';

    if (!file) return;

    setError('');
    setMessage('');

    if (file.type !== 'image/jpeg') {
      setError('Please select a JPEG image.');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError('Image size must be 5 MB or smaller.');
      return;
    }

    if (previewRef.current) {
      URL.revokeObjectURL(previewRef.current);
    }

    const localPreview = URL.createObjectURL(file);
    previewRef.current = localPreview;

    setPreview(localPreview);
    setPhotoSelected(true);
    setUploading(true);

    // Clear the previous image URL while uploading a new image
    setForm(f => ({ ...f, imageUrl: '' }));

    try {
      const formData = new FormData();
      formData.append('image', file);

      const { data } = await api.post('/uploads/image', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });

      if (!data.imageUrl) {
        throw new Error('Image URL was not returned');
      }

      setForm(f => ({
        ...f,
        imageUrl: data.imageUrl
      }));

      setMessage('Photo uploaded successfully!');
    } catch (err) {
      console.error('Photo upload failed:', err);

      setError(
        err.response?.data?.message ||
        'Photo upload failed. Please try again.'
      );
    } finally {
      setUploading(false);
    }
  };

  const removePhoto = () => {
    if (previewRef.current) {
      URL.revokeObjectURL(previewRef.current);
      previewRef.current = null;
    }

    setPreview('');
    setPhotoSelected(false);
    setForm(f => ({ ...f, imageUrl: '' }));
    setError('');
    setMessage('');

    if (cameraRef.current) cameraRef.current.value = '';
    if (galleryRef.current) galleryRef.current.value = '';
  };

  const locate = () => {
    setError('');

    if (!navigator.geolocation) {
      setError('Geolocation is not supported by this browser');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      p => {
        setForm(f => ({
          ...f,
          latitude: p.coords.latitude,
          longitude: p.coords.longitude
        }));
      },
      () => setError('Location permission was not granted')
    );
  };

  const submit = async e => {
    e.preventDefault();
    setError('');
    setMessage('');

    if (uploading) {
      setError('Please wait for the photo upload to finish.');
      return;
    }

    if (photoSelected && !form.imageUrl) {
      setError('Your photo has not uploaded. Please select it again.');
      return;
    }

    try {
      const { data } = await api.post('/reports', {
        ...form,
        latitude: form.latitude ? Number(form.latitude) : null,
        longitude: form.longitude ? Number(form.longitude) : null
      });

      setMessage(
        `Request submitted. ${data.notifiedOrganizations} verified NGO(s) in your city were notified.`
      );

      setTimeout(() => nav('/dashboard'), 2200);
    } catch (err) {
      setError(
        err.response?.data?.message ||
        'Could not submit report'
      );
    }
  };

  return (
    <div className="page narrow">
      <span className="eyebrow">CITIZEN SERVICES</span>

      <h1>Report an animal emergency</h1>

      <p className="muted">
        Share accurate details so a verified rescue partner can assess the request.
      </p>

      <form className="form-card" onSubmit={submit}>
        <div className="two">
          <label>
            Animal type
            <select
              name="animalType"
              value={form.animalType}
              onChange={change}
            >
              {['Dog', 'Cat', 'Cow', 'Bird', 'Other'].map(x => (
                <option key={x} value={x}>{x}</option>
              ))}
            </select>
          </label>

          <label>
            Emergency type
            <select
              name="emergencyType"
              value={form.emergencyType}
              onChange={change}
            >
              {[
                'Injured in accident',
                'Sick or weak',
                'Trapped',
                'Abandoned',
                'Abuse or cruelty',
                'Other'
              ].map(x => (
                <option key={x} value={x}>{x}</option>
              ))}
            </select>
          </label>
        </div>

        <label>
          What happened?
          <textarea
            required
            name="description"
            value={form.description}
            onChange={change}
            placeholder="Describe the animal's condition and immediate risks..."
          />
        </label>

        <div className="photo-section">
          <label>Animal photo (optional)</label>

          <p className="muted">
            Take a photo or choose an existing image. JPEG only, maximum 5 MB.
          </p>

          <input
            ref={cameraRef}
            type="file"
            accept="image/jpeg"
            capture="environment"
            hidden
            onChange={selectPhoto}
          />

          <input
            ref={galleryRef}
            type="file"
            accept="image/jpeg"
            hidden
            onChange={selectPhoto}
          />

          <div className="two">
            <button
              type="button"
              className="btn light full"
              onClick={() => cameraRef.current?.click()}
              disabled={uploading}
            >
              📸 Take Photo
            </button>

            <button
              type="button"
              className="btn light full"
              onClick={() => galleryRef.current?.click()}
              disabled={uploading}
            >
              🖼️ Upload Image
            </button>
          </div>

          {preview && (
            <div className="photo-preview" style={{ marginTop: '16px' }}>
              <img
                src={preview}
                alt="Selected animal"
                style={{
                  display: 'block',
                  width: '100%',
                  maxHeight: '300px',
                  objectFit: 'contain',
                  borderRadius: '12px'
                }}
              />

              <div className="two" style={{ marginTop: '12px' }}>
                <button
                  type="button"
                  className="btn light full"
                  onClick={() => cameraRef.current?.click()}
                  disabled={uploading}
                >
                  Retake
                </button>

                <button
                  type="button"
                  className="btn light full"
                  onClick={removePhoto}
                  disabled={uploading}
                >
                  Remove Photo
                </button>
              </div>
            </div>
          )}

          {uploading && (
            <p className="muted" role="status">
              Uploading photo to Supabase...
            </p>
          )}

          {form.imageUrl && !uploading && (
            <p className="success">
              ✓ Photo uploaded successfully
            </p>
          )}
        </div>

        <div className="two">
          <label>
            City
            <input
              required
              name="city"
              value={form.city}
              onChange={change}
            />
          </label>

          <label>
            State
            <input
              required
              name="state"
              value={form.state}
              onChange={change}
            />
          </label>
        </div>

        <label>
          Exact address / landmark
          <input
            required
            name="address"
            value={form.address}
            onChange={change}
          />
        </label>

        <button
          type="button"
          className="btn light full"
          onClick={locate}
        >
          Use my current GPS location
        </button>

        <div className="two">
          <label>
            Latitude
            <input
              name="latitude"
              value={form.latitude}
              onChange={change}
            />
          </label>

          <label>
            Longitude
            <input
              name="longitude"
              value={form.longitude}
              onChange={change}
            />
          </label>
        </div>

        {error && <div className="error">{error}</div>}
        {message && <div className="success">{message}</div>}

        <button
          className="btn primary full"
          type="submit"
          disabled={uploading}
        >
          {uploading ? 'Uploading photo...' : 'Submit rescue request'}
        </button>
      </form>
    </div>
  );
}
