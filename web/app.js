// Constants
const LISBON_COORDINATES = [38.7223, -9.1393];
const API_BASE_URL = 'https://192.168.1.66:8000'; // Update this with your actual API URL
const RECAPTCHA_SITE_KEY = '6LdUaSgrAAAAALEeJ9cbI1CotgAcYEhE4V2DFvLd'; 

// Alpine.js Component
function issueForm() {
    return {
        // State
        media: [],
        currentMediaIndex: 0,
        position: LISBON_COORDINATES,
        municipality: null,
        municipalityEmail: null,
        streetAddress: null,
        description: '',
        category: '',
        email: '',
        phoneNumber: '',
        otp: '',
        loading: false,
        isDetecting: false,
        errorMessage: '',
        locationError: '',
        otpError: '',
        showOtpModal: false,
        showSuccessModal: false,
        municipalityInfo: '',
        formSubmissionData: null,
        isLoadingMunicipality: false,

        // Map elements
        map: null,
        marker: null,

        // Methods
        async getRecaptchaToken() {
            try {
                // Wait for reCAPTCHA to be ready
                await new Promise((resolve) => {
                    if (window.grecaptcha && window.grecaptcha.execute) {
                        resolve();
                    } else {
                        window.onloadRecaptcha = resolve;
                    }
                });

                const token = await grecaptcha.execute(RECAPTCHA_SITE_KEY, { action: 'submit' });
                return token;
            } catch (error) {
                console.error('Error getting reCAPTCHA token:', error);
                throw error;
            }
        },

        init() {
            console.log('Initializing form component');
            this.initMap();
            this.updatePosition(LISBON_COORDINATES[0], LISBON_COORDINATES[1]);
        },

        initMap() {
            if (this.map) {
                return; // Map is already initialized
            }
            this.map = L.map('map').setView(this.position, 13);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            }).addTo(this.map);

            this.marker = L.marker(this.position).addTo(this.map);

            this.map.on('click', (e) => {
                const { lat, lng } = e.latlng;
                this.updatePosition(lat, lng);
            });
        },

        updatePosition(lat, lng) {
            this.position = [lat, lng];
            this.marker.setLatLng(this.position);
            this.map.setView(this.position, 17, { animate: true, duration: 1 });
            this.fetchMunicipality(lat, lng);
        },

        async fetchMunicipality(lat, lng) {
            try {
                this.isLoadingMunicipality = true;
                const recaptchaToken = await this.getRecaptchaToken();
                const response = await fetch(`${API_BASE_URL}/municipality/`, {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'X-Recaptcha-Token': recaptchaToken
                    },
                    body: JSON.stringify({ latitude: lat, longitude: lng })
                });
                const data = await response.json();
                
                this.municipality = data.municipality;
                this.municipalityEmail = data.email;
                this.streetAddress = data.street_address;
            } catch (error) {
                this.municipality = null;
                this.municipalityEmail = null;
                this.streetAddress = null;
            } finally {
                this.isLoadingMunicipality = false;
            }
        },

        handleMediaUpload(files) {
            const newMedia = Array.from(files).map(file => ({
                file,
                type: 'image',
                preview: URL.createObjectURL(file)
            }));

            this.media = [...this.media, ...newMedia].slice(0, 3);
        },

        removeMedia(index) {
            this.media = this.media.filter((_, i) => i !== index);
            if (this.currentMediaIndex >= index && this.currentMediaIndex > 0) {
                this.currentMediaIndex--;
            }
        },

        setCurrentMediaIndex(index) {
            this.currentMediaIndex = index;
        },

        getCurrentLocation() {
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                    (position) => {
                        const { latitude, longitude } = position.coords;
                        this.updatePosition(latitude, longitude);
                        this.locationError = '';
                    },
                    (error) => {
                        this.locationError = 'Unable to get your current location. Please make sure location services are enabled.';
                    }
                );
            } else {
                this.locationError = 'Geolocation is not supported by your browser.';
            }
        },

        async detectCategory() {
            if (!this.description.trim()) {
                this.errorMessage = 'Please enter a description first';
                return;
            }

            this.isDetecting = true;
            this.errorMessage = '';

            try {
                const recaptchaToken = await this.getRecaptchaToken();
                const response = await fetch(`${API_BASE_URL}/detect-category/`, {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'X-Recaptcha-Token': recaptchaToken
                    },
                    body: JSON.stringify({ description: this.description })
                });
                const data = await response.json();
                this.category = data.category_id;
            } catch (error) {
                this.errorMessage = 'Failed to detect category. Please try again.';
            } finally {
                this.isDetecting = false;
            }
        },

        async handleSubmit() {
            console.log('Handling form submission');
            this.loading = true;
            this.errorMessage = '';

            if (!this.email) {
                this.errorMessage = 'Por favor, forneça um endereço de email válido.';
                this.loading = false;
                return;
            }

            try {
                const formData = new FormData();
                formData.append('latitude', this.position[0].toString());
                formData.append('longitude', this.position[1].toString());
                formData.append('category', this.category);
                formData.append('email', this.email);
                formData.append('description', this.description);
                formData.append('phone_number', this.phoneNumber);

                this.media.forEach((media, index) => {
                    formData.append(`file${index}`, media.file);
                });

                // Submit form and get submission ID
                const recaptchaToken = await this.getRecaptchaToken();
                const response = await fetch(`${API_BASE_URL}/issues/`, {
                    method: 'POST',
                    headers: {
                        'X-Recaptcha-Token': recaptchaToken
                    },
                    body: formData
                });

                if (!response.ok) {
                    throw new Error('Failed to submit form');
                }

                const { submission_id } = await response.json();
                console.log('Form submitted successfully, showing OTP modal');
                
                // Store submission ID and show OTP modal
                this.formSubmissionData = { submission_id };
                this.showOtpModal = true;
                console.log('showOtpModal set to:', this.showOtpModal);
            } catch (error) {
                console.error('Error submitting form:', error);
                this.errorMessage = 'Failed to submit form. Please try again.';
            } finally {
                this.loading = false;
            }
        },

        handleOtpInput(event) {
            this.otp = event.target.value.replace(/\D/g, '').slice(0, 6);
            if (this.otp.length === 6) {
                this.verifyOTPAndSubmit();
            }
        },

        async verifyOTPAndSubmit() {
            if (!this.formSubmissionData) return;

            this.loading = true;
            this.otpError = '';

            try {
                const recaptchaToken = await this.getRecaptchaToken();
                const response = await fetch(`${API_BASE_URL}/validate-form/`, {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'X-Recaptcha-Token': recaptchaToken
                    },
                    body: JSON.stringify({
                        submission_id: this.formSubmissionData.submission_id,
                        phoneNumber: this.phoneNumber,
                        otp: this.otp
                    })
                });

                if (!response.ok) {
                    throw new Error('Invalid OTP');
                }

                // Clear form data and show success
                this.formSubmissionData = null;
                this.showOtpModal = false;
                this.showSuccessModal = true;
            } catch (error) {
                this.otpError = error.message === 'Invalid OTP' 
                    ? 'Invalid or expired OTP. Please try again.'
                    : 'Failed to validate form. Please try again.';
            } finally {
                this.loading = false;
            }
        },

        handleNewIssue() {
            this.media = [];
            this.currentMediaIndex = 0;
            this.position = LISBON_COORDINATES;
            this.municipality = null;
            this.municipalityEmail = null;
            this.streetAddress = null;
            this.description = '';
            this.category = '';
            this.email = '';
            this.phoneNumber = '';
            this.otp = '';
            this.loading = false;
            this.errorMessage = '';
            this.locationError = '';
            this.otpError = '';
            this.showOtpModal = false;
            this.showSuccessModal = false;
            this.municipalityInfo = '';
            this.formSubmissionData = null;

            this.updatePosition(LISBON_COORDINATES[0], LISBON_COORDINATES[1]);
        },

        recenterMap() {
            if (this.map && this.position) {
                this.map.setView(this.position, 17, { animate: true, duration: 1 });
            }
        },

        closeOtpModal() {
            this.showOtpModal = false;
            this.otp = '';
            this.otpError = '';
        }
    };
} 