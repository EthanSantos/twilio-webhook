// Import the Supabase client library
import { createClient } from '@supabase/supabase-js';

export default {

  	async fetch(request, env, ctx) {
    	// only process POST requests for twilio 
		if (request.method !== 'POST') {
			return new Response('Expected POST request', { status: 405 });
		}

    	let fromPhoneNumber = null;
   		let messageBody = null;

		try {
			const formData = await request.formData();
			fromPhoneNumber = formData.get('From'); // sender's number
			messageBody = formData.get('Body'); // message body
		} catch (error) {
			console.error("Error parsing form data:", error);
			return new Response('Failed to parse form data', { status: 400 });
		}

		if (!fromPhoneNumber || !messageBody) {
			console.error('Missing form/body in the webhook arguments');
			return new Response('Missing required fields', { status: 400 });
		}

    	const normalizedMessageBody = messageBody.toUpperCase().trim();

		if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
			console.error("Environment variables not set");
			return createTwimlResponse("Server configuration error.");
		}

		const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
			auth: {
				persistSession: false,
				autoRefreshToken: false,
				detectSessionInUrl: false,
			}
		});

    	let responseMessage = '';

    	try {
      		// check if the phone number exists in our supabase table
      		const { data: existingSubscriber, error: selectError } = await supabase
				.from('subscribers')
				.select('phone_number')
				.eq('phone_number', fromPhoneNumber)
				.limit(1)
				.maybeSingle(); // returns the record or null

			if (selectError) {
				console.error('Supabase select error:', selectError);
				responseMessage = 'There was a server error checking your status.';
				return createTwimlResponse(responseMessage);
			}

      		const isSubscribed = !!existingSubscriber;

			switch (normalizedMessageBody) {
				case 'FINDOOTD':
					if (isSubscribed) {
						responseMessage = "Hey! You've already got the download for the app.";
					} else {
						// not subscribers
						const subscriberData = { phone_number: fromPhoneNumber };
						const { error: insertError } = await supabase
							.from('subscribers')
							.insert(subscriberData);

						if (insertError) {
							console.error('Supabase insert error:', insertError);
							responseMessage = 'Sorry, there was an error subscribing you. Please try again.';
						} else {
							responseMessage = 'Thanks for subscribing! Here’s the download link: https://ootd-website.vercel.app/';
						}
					}
					break;

				case 'HELPOOTD':
					if (!isSubscribed) {
						// insert to our database if not subscribed
						const subscriberData = { phone_number: fromPhoneNumber };
						const { error: insertError } = await supabase
							.from('subscribers')
							.insert(subscriberData);

						if (insertError) {
							console.error('Supabase insert error on help request:', insertError);
						}
					}
					responseMessage = 'Need help? Join our discord: https://discord.gg/pA3xUjDT3E';
					break;

				default:
					responseMessage = 'Unknown command. Text FINDOOTD to subscribe or HELPOOTD for help.';
					break;
			}

		} catch (error) {
			console.error('Cloudflare worker error:', error);
			if (error instanceof Error) {
				console.error(error.message);
				console.error(error.stack);
			}
			responseMessage = 'An unexpected error occurred. Please try again later.';
		}

    	return createTwimlResponse(responseMessage);
	},
};

// helper functions for twilio response handling
function createTwimlResponse(message) {
	const twiml = 
	`<?xml version="1.0" encoding="UTF-8"?>
	<Response>
		<Message>${escapeXml(message)}</Message>
	</Response>`;

	return new Response(twiml, {headers: { 'Content-Type': 'text/xml' },
	});
}

function escapeXml(unsafe) {
	if (unsafe === null || typeof unsafe === 'undefined') {
		return '';
	}
	return String(unsafe).replace(/[<>&'"]/g, (c) => {
	switch (c) {
		case '<': return '&lt;';
		case '>': return '&gt;';
		case '&': return '&amp;';
		case '\'': return '&apos;';
		case '"': return '&quot;';
		default: return c;
	}
	});
}
